/**
 * Synthesised engine sound (no samples), configured per car.
 *
 * An AudioWorklet fires one exhaust pulse per combustion — N per two crank revolutions — with
 * slightly different strength per cylinder and the two banks reaching the collector a fraction of
 * a millisecond apart. That uneven pulse train gives a flat-six its rasp (and a cross-plane V8 its
 * burble); filters add exhaust resonance, and separate voices add the air-cooling fan whine
 * (air-cooled cars), turbo whistle and wastegate chuff (turbo cars) and overrun pops.
 */

export interface EngineConfig {
  cylinders: number
  redline: number
  idle: number
  turbo: boolean
  airCooled: boolean
  /** Road speed (km/h) at the redline in each gear. */
  gearTops: number[]
}

const WORKLET = /* js */ `
// per-cylinder strength: the "uneven" burble (indexed by firing slot)
const GAIN = [1.0, 0.86, 0.95, 1.08, 0.9, 1.02, 0.93, 1.05, 0.88, 0.99]
// cross-plane V8 fires its banks unevenly (L R R L R L L R): that's the V8 burble
const V8_BANKS = [0, 1, 1, 0, 1, 0, 0, 1]
class FlatSix extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 900, minValue: 0, maxValue: 9000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'overrun', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'cylinders', defaultValue: 6, minValue: 2, maxValue: 12, automationRate: 'k-rate' },
    ]
  }
  constructor() {
    super()
    this.angle = 0
    this.slot = 0
    this.env = [0, 0]
    this.grit = [0, 0]
    this.delay = new Float32Array(128)
    this.dw = 0
    this.hp = 0
    this.hpIn = 0
  }
  process(_inputs, outputs, p) {
    const out = outputs[0][0]
    const rpm = p.rpm[0], load = p.load[0], overrun = p.overrun[0]
    const n = Math.round(p.cylinders[0])
    const interval = 720 / n                                  // crank degrees between firings
    const dAngle = (rpm * 6) / sampleRate                     // crank degrees per sample
    const tau = 0.0022 + 0.0025 * Math.min(1, 1500 / Math.max(rpm, 600))
    const decay = Math.exp(-1 / (tau * sampleRate))
    const roughness = 0.2 + 0.45 * load
    const bankDelay = Math.round(0.00065 * sampleRate)        // right bank's longer path to the collector
    for (let i = 0; i < out.length; i++) {
      this.angle += dAngle
      if (this.angle >= 720) this.angle -= 720
      const slot = Math.floor(this.angle / interval)
      if (slot !== this.slot) {
        this.slot = slot
        const bank = n === 8 ? V8_BANKS[slot % 8] : slot % 2
        let a = GAIN[slot % GAIN.length] * (0.3 + 0.7 * load) * (0.94 + Math.random() * 0.12)
        let grit = roughness
        if (overrun > 0 && Math.random() < 0.07 * overrun) { a = 1.6 + Math.random(); grit = 0.9 } // overrun pop
        this.env[bank] = a
        this.grit[bank] = grit
      }
      const n0 = Math.random() * 2 - 1, n1 = Math.random() * 2 - 1
      const left = this.env[0] * (1 - this.grit[0] + this.grit[0] * n0)
      const right = this.env[1] * (1 - this.grit[1] + this.grit[1] * n1)
      this.env[0] *= decay
      this.env[1] *= decay
      this.delay[this.dw] = right
      const delayed = this.delay[(this.dw - bankDelay + 128) % 128]
      this.dw = (this.dw + 1) % 128
      const x = left + delayed
      // DC blocker
      this.hp = 0.995 * (this.hp + x - this.hpIn)
      this.hpIn = x
      out[i] = this.hp
    }
    return true
  }
}
registerProcessor('flat-six', FlatSix)
`

class EngineSound {
  private ctx: AudioContext | null = null
  private ready = false
  private master!: GainNode
  private body!: GainNode
  private lowpass!: BiquadFilterNode
  private six!: AudioWorkletNode
  private fan!: OscillatorNode
  private fanGain!: GainNode
  private whistle!: OscillatorNode
  private whistleGain!: GainNode
  private noise!: AudioBuffer

  private cfg: EngineConfig = { cylinders: 6, redline: 6800, idle: 900, turbo: true, airCooled: true, gearTops: [70, 120, 180, 255] }
  private gear = 0
  private rpm = 900
  private boost = 0
  private lastThrottle = 0
  private muted = false
  /** 0 = silent (parked), 1 = running; fades so the engine falls quiet after the car stops. */
  private level = 0

  /** Must be called from a user gesture (autoplay policy). Safe to call repeatedly. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))
    ctx.audioWorklet
      .addModule(url)
      .then(() => {
        if (this.ctx === ctx) this.build(ctx)
      })
      .finally(() => URL.revokeObjectURL(url))

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void ctx.suspend()
      else void ctx.resume()
    })
  }

  private build(ctx: AudioContext) {
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    // exhaust: pulse train → resonances → saturation → throttle-opened low-pass
    this.six = new AudioWorkletNode(ctx, 'flat-six')
    const hp = filter(ctx, 'highpass', 35, 0.7)
    const body = filter(ctx, 'peaking', 170, 1.1, 7) // pipe "boom"
    const rasp = filter(ctx, 'peaking', 520, 1.4, 5) // flat-six rasp
    const shaper = ctx.createWaveShaper()
    shaper.curve = softClip(2.2)
    shaper.oversample = '2x'
    this.lowpass = filter(ctx, 'lowpass', 900, 0.8)
    this.body = ctx.createGain()
    this.body.gain.value = 0.22
    this.six.connect(hp).connect(body).connect(rasp).connect(shaper).connect(this.lowpass).connect(this.body).connect(this.master)

    // air-cooling fan: belt-driven at ~1.8× crank speed, 11 blades → a whine that climbs with revs
    this.fan = ctx.createOscillator()
    this.fan.type = 'triangle'
    this.fanGain = ctx.createGain()
    this.fanGain.gain.value = 0
    this.fan.connect(filter(ctx, 'bandpass', 1200, 2)).connect(this.fanGain).connect(this.master)
    this.fan.start()

    // turbo whistle
    this.whistle = ctx.createOscillator()
    this.whistle.type = 'sine'
    this.whistleGain = ctx.createGain()
    this.whistleGain.gain.value = 0
    this.whistle.connect(this.whistleGain).connect(this.master)
    this.whistle.start()

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    this.ready = true
  }

  /** Switch to another car's engine character. */
  configure(cfg: EngineConfig) {
    this.cfg = cfg
    this.gear = 0
    this.rpm = cfg.idle
    this.boost = 0
  }

  setMuted(m: boolean) {
    this.muted = m
    this.applyVolume(0.03)
  }

  /** Stop all audio (used when the module is hot-reloaded in dev). */
  close() {
    void this.ctx?.close()
    this.ctx = null
    this.ready = false
  }

  private applyVolume(timeConstant: number) {
    if (!this.ctx || !this.ready) return
    const v = this.muted ? 0 : 0.6 * this.level
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, timeConstant)
  }

  /** @param speed m/s (signed) @param throttle 0..1 */
  update(dt: number, speed: number, throttle: number) {
    const ctx = this.ctx
    if (!ctx || !this.ready || ctx.state !== 'running') return
    const kmh = Math.abs(speed) * 3.6

    // only audible while accelerating or rolling: fade in fast, fade out over ~1.5 s once stopped
    const active = throttle > 0 || kmh > 2
    this.level += ((active ? 1 : 0) - this.level) * Math.min(1, dt * (active ? 6 : 1.5))
    if (this.level < 0.002 && !active) this.level = 0
    this.applyVolume(0.05)

    // gearbox
    const { gearTops, idle, redline, turbo, airCooled, cylinders } = this.cfg
    if (speed < 0) this.gear = 0
    else if (this.gear < gearTops.length - 1 && kmh > gearTops[this.gear] * 0.95) this.gear++
    else if (this.gear > 0 && kmh < gearTops[this.gear - 1] * 0.55) this.gear--

    let target = idle + (kmh / gearTops[this.gear]) * (redline - idle)
    if (kmh < 8) target = Math.max(target, idle + throttle * 2600) // clutch slip when pulling away
    target = Math.min(target, redline)
    this.rpm += (target - this.rpm) * Math.min(1, dt * 8)

    // turbo lag: boost builds slowly above ~3,000 rpm, collapses off-throttle
    const spooling = turbo && throttle > 0.5 && this.rpm > 3000
    this.boost = Math.max(0, Math.min(1, this.boost + (spooling ? 0.9 : -2.5) * dt))
    if (this.lastThrottle > 0.5 && throttle < 0.5 && this.boost > 0.45) this.chuff(this.boost)
    this.lastThrottle = throttle

    const t = ctx.currentTime
    const r = this.rpm / redline
    const load = Math.min(1, throttle * 0.7 + this.boost * 0.3)
    const p = this.six.parameters
    p.get('rpm')!.setTargetAtTime(this.rpm, t, 0.02)
    p.get('cylinders')!.setValueAtTime(cylinders, t)
    p.get('load')!.setTargetAtTime(load, t, 0.04)
    p.get('overrun')!.setTargetAtTime(throttle === 0 && this.rpm > 3000 ? r : 0, t, 0.05)
    this.lowpass.frequency.setTargetAtTime(650 + load * 3200 + r * 1500, t, 0.05)
    this.body.gain.setTargetAtTime(0.16 + load * 0.14, t, 0.05)
    this.fan.frequency.setTargetAtTime((this.rpm / 60) * 1.8 * 11, t, 0.05)
    this.fanGain.gain.setTargetAtTime(airCooled ? 0.004 + r * 0.012 : 0, t, 0.05)
    this.whistle.frequency.setTargetAtTime(1800 + this.boost * 3000, t, 0.08)
    this.whistleGain.gain.setTargetAtTime(this.boost * this.boost * 0.012, t, 0.08)
  }

  /** Wastegate/compressor surge "chuff" when lifting off under boost. */
  private chuff(strength: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const bp = filter(ctx, 'bandpass', 2400, 0.9)
    const g = ctx.createGain()
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.1 * strength, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    src.connect(bp).connect(g).connect(this.master)
    src.start(t, Math.random())
    src.stop(t + 0.4)
  }
}

function filter(ctx: AudioContext, type: BiquadFilterType, freq: number, q: number, gain = 0) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  f.gain.value = gain
  return f
}

function softClip(k: number) {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x) / Math.tanh(k)
  }
  return curve
}

export const engine = new EngineSound()
if (import.meta.env.DEV) Object.assign(window, { __engine: engine, __engineWorklet: WORKLET })

// dev: a hot-reloaded module would otherwise leave the previous AudioContext playing forever
if (import.meta.hot) import.meta.hot.dispose(() => engine.close())
