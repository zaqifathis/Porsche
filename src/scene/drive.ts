import * as THREE from 'three'

/** Mutable driving state, updated every frame (kept out of React to avoid re-renders). */
export const drive = {
  position: new THREE.Vector3(),
  heading: 0, // radians, 0 = facing +z
  speed: 0, // m/s, negative = reverse
  steer: 0, // front wheel angle, radians
  wheelSpin: 0, // accumulated wheel rotation, radians
  keys: { up: false, down: false, left: false, right: false },
  /** True while the car waits for the city to load. */
  locked: false,
  /** Optional obstacle test in local metres (set by the city). */
  collide: null as ((x: number, z: number) => boolean) | null,
  /** Optional "put me back on the road" (set by the city). */
  respawn: null as (() => void) | null,
  /** Driver's eye in car space (+z forward, +x = the car's left), set per car model. */
  eye: new THREE.Vector3(0.33, 1.05, 0.2),
  /** Optional ground height under (x, z), for terrain (set by the photoreal city). */
  ground: null as ((x: number, z: number) => number | null) | null,
}

const MAX_REVERSE = 10
const BRAKE = 28
const DRAG = 0.8
const MAX_STEER = 0.55

/** Per-car handling, set when a car is chosen (defaults: the 930). */
const cfg = {
  maxSpeed: 69.5, // m/s
  accel: 14, // m/s²
  wheelbase: 2.59,
  wheelRadius: 0.48,
  halfLength: 2.3,
  halfWidth: 0.9,
}

export function configureDrive(c: { topSpeedKmh: number; accel: number; wheelbase: number; wheelRadius: number; halfLength: number; halfWidth: number }) {
  cfg.maxSpeed = c.topSpeedKmh / 3.6
  cfg.accel = c.accel
  cfg.wheelbase = c.wheelbase
  cfg.wheelRadius = c.wheelRadius
  cfg.halfLength = c.halfLength
  cfg.halfWidth = c.halfWidth
}

const forward = new THREE.Vector3()

export function resetDrive() {
  drive.position.set(0, 0, 0)
  drive.heading = 0
  drive.speed = 0
  drive.steer = 0
}

/** Advance the simple bicycle-model car. Returns how far the car moved this frame. */
export function stepDrive(dt: number, out: THREE.Vector3): THREE.Vector3 {
  const { keys } = drive
  out.set(0, 0, 0)
  if (drive.locked) {
    drive.speed = 0
    return out
  }
  const throttle = (keys.up ? 1 : 0) - (keys.down ? 1 : 0)

  if (throttle > 0) drive.speed += (drive.speed < 0 ? BRAKE : cfg.accel * (1 - 0.6 * Math.max(0, drive.speed) / cfg.maxSpeed)) * dt
  else if (throttle < 0) drive.speed -= (drive.speed > 0 ? BRAKE : 8) * dt
  else drive.speed = THREE.MathUtils.damp(drive.speed, 0, DRAG, dt)
  if (Math.abs(drive.speed) < 0.02 && throttle === 0) drive.speed = 0
  drive.speed = THREE.MathUtils.clamp(drive.speed, -MAX_REVERSE, cfg.maxSpeed)

  // steering eases in/out and tightens less at high speed
  const steerInput = (keys.left ? 1 : 0) - (keys.right ? 1 : 0)
  const limit = MAX_STEER / (1 + Math.abs(drive.speed) * 0.09)
  drive.steer = THREE.MathUtils.damp(drive.steer, steerInput * limit, 6, dt)

  const prevHeading = drive.heading
  drive.heading += (drive.speed / cfg.wheelbase) * Math.tan(drive.steer) * dt
  forward.set(Math.sin(drive.heading), 0, Math.cos(drive.heading))
  out.copy(forward).multiplyScalar(drive.speed * dt)
  drive.position.add(out)

  if (drive.collide && hitsObstacle()) {
    // bump: undo the move and bounce back a little
    drive.position.sub(out)
    drive.heading = prevHeading
    drive.speed *= -0.25
    out.set(0, 0, 0)
  }

  // follow the terrain: ease toward the sampled ground height (and report it for the camera)
  if (drive.ground) {
    const g = drive.ground(drive.position.x, drive.position.z)
    if (g !== null) {
      const dy = (g - drive.position.y) * Math.min(1, dt * 12)
      drive.position.y += dy
      out.y = dy
    }
  }

  drive.wheelSpin += (drive.speed * dt) / cfg.wheelRadius
  return out
}

/** Test the car's footprint (corners + nose/tail) against obstacles. */
function hitsObstacle(): boolean {
  const fx = Math.sin(drive.heading), fz = Math.cos(drive.heading)
  const rx = fz, rz = -fx
  const { x, z } = drive.position
  const L = cfg.halfLength, W = cfg.halfWidth * 0.92
  const footprint: [number, number][] = [
    [L, 0], [L * 0.92, W], [L * 0.92, -W], [-L * 0.92, W], [-L * 0.92, -W], [-L, 0], [0, W], [0, -W],
  ]
  for (const [f, r] of footprint) {
    if (drive.collide!(x + fx * f + rx * r, z + fz * f + rz * r)) return true
  }
  return false
}

const KEY_MAP: Record<string, keyof typeof drive.keys> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

export function bindDriveKeys() {
  const set = (e: KeyboardEvent, v: boolean) => {
    const k = KEY_MAP[e.code]
    if (!k) return
    const el = e.target as HTMLElement | null
    if (el?.tagName === 'INPUT' || el?.closest?.('.map-overlay')) return
    e.preventDefault()
    drive.keys[k] = v
  }
  const down = (e: KeyboardEvent) => set(e, true)
  const up = (e: KeyboardEvent) => set(e, false)
  const blur = () => Object.keys(drive.keys).forEach((k) => (drive.keys[k as keyof typeof drive.keys] = false))
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
  }
}
