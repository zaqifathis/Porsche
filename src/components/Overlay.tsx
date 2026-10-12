import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useProgress } from '@react-three/drei'
import { photorealActive, useStore, CAM_VIEWS, type CamView } from '../store'
import { PAINTS } from '../data/car'
import { CARS, carById, type Source } from '../data/cars'
import { drive } from '../scene/drive'
import {
  IconBird,
  IconChase,
  IconClose,
  IconCockpit,
  IconDownload,
  IconInfo,
  IconMap,
  IconMute,
  IconSound,
  IconStudio,
  IconMoon,
  IconReset,
  IconRotate,
  IconSun,
} from './Icons'

export function TopBar() {
  const dark = useStore((s) => s.dark)
  const toggleDark = useStore((s) => s.toggleDark)
  const mode = useStore((s) => s.mode)
  const openShowroom = useStore((s) => s.openShowroom)
  const closeShowroom = useStore((s) => s.closeShowroom)
  const darkLocked = useStore(photorealActive)
  const car = carById(useStore((s) => s.carId))
  return (
    <header className="topbar">
      <div className="brand">
        <button
          className="wordmark wordmark-btn"
          onClick={mode === 'showroom' ? closeShowroom : openShowroom}
          title={mode === 'showroom' ? 'Back to the studio' : 'Open the showroom: every car, by year'}
        >
          PORSCHE
        </button>
        {mode !== 'showroom' && (
          <>
            <span className="divider" />
            <CarMenu />
          </>
        )}
      </div>
      <div className="topbar-actions">
        <a className="ghost-btn" href={car.credit.url} target="_blank" rel="noreferrer" title={`${car.credit.title} on Sketchfab`}>
          <IconDownload />
          <span className="hide-sm">Model</span>
        </a>
        <SoundToggle />
        <button
          className={`theme-toggle ${dark ? 'on' : ''}`}
          onClick={toggleDark}
          disabled={darkLocked}
          aria-label={darkLocked ? 'Night mode is off for photoreal cities' : dark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={darkLocked ? 'Night mode is not available with photoreal tiles (they are daylight photos)' : dark ? 'Lights off' : 'Night mode — lights on'}
        >
          <span className="knob">{dark ? <IconMoon width={14} height={14} /> : <IconSun width={14} height={14} />}</span>
        </button>
      </div>
    </header>
  )
}

/** Model name in the top bar: a menu to switch cars (oldest first). */
function CarMenu() {
  const carId = useStore((s) => s.carId)
  const setCar = useStore((s) => s.setCar)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const car = carById(carId)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="car-menu" ref={ref}>
      <button className="model model-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        {car.name} <em>{car.code}</em>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <ul className="car-menu-list" role="listbox">
          {CARS.map((c) => (
            <li key={c.id}>
              <button
                role="option"
                aria-selected={c.id === carId}
                className={c.id === carId ? 'active' : ''}
                onClick={() => {
                  setCar(c.id)
                  setOpen(false)
                }}
              >
                <span className="car-menu-year">{c.year}</span>
                <span className="car-menu-name">{c.name}</span>
                <span className="car-menu-code">{c.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SoundToggle() {
  const muted = useStore((s) => s.muted)
  const toggle = useStore((s) => s.toggleMuted)
  return (
    <button className="icon-btn" onClick={toggle} aria-label={muted ? 'Unmute engine' : 'Mute engine'} title={muted ? 'Engine sound off' : 'Engine sound on'}>
      {muted ? <IconMute /> : <IconSound />}
    </button>
  )
}

/** City name + tile loading state, shown while driving in a city. */
export function CityBadge() {
  const city = useStore((s) => s.city)
  const mode = useStore((s) => s.mode)
  const status = useStore((s) => s.cityStatus)
  const error = useStore((s) => s.photorealError)
  if (mode !== 'city' || !city) return null
  return (
    <div className="city-badge">
      <strong>{city.name}</strong>
      {error ? (
        <span className="city-badge-error">{error}</span>
      ) : (
        status && (
          <span>
            <i className="spinner" />
            {status}
          </span>
        )
      )}
    </div>
  )
}

export function InfoPanel() {
  const car = carById(useStore((s) => s.carId))
  const [tab, setTab] = useState<'specs' | 'history'>('specs')
  const [open, setOpen] = useState(() => window.innerWidth > 720)

  if (!open)
    return (
      <button className="panel-fab" onClick={() => setOpen(true)} aria-label="Show info">
        <IconInfo />
      </button>
    )

  return (
    <aside className="panel">
      <button className="panel-close" onClick={() => setOpen(false)} aria-label="Close">
        <IconClose width={16} height={16} />
      </button>
        <div className="car-detail" key={car.id}>
          <span className="eyebrow">{car.year}</span>
          <h1>
            {car.name}
            <small>{car.code}</small>
          </h1>
          <p className="tagline">{car.tagline}</p>
          <div className="tabs">
            <button className={tab === 'specs' ? 'active' : ''} onClick={() => setTab('specs')}>
              Specs
            </button>
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
              History
            </button>
          </div>
          {tab === 'specs' ? (
            <dl className="specs">
              {car.specs.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>
                    {s.value}
                    <Cite sources={car.sources} n={s.src} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <ol className="timeline">
              {car.history.map((h) => (
                <li key={h.year + h.text}>
                  <span>{h.year}</span>
                  <p>
                    {h.text}
                    <Cite sources={car.sources} n={h.src} />
                  </p>
                </li>
              ))}
            </ol>
          )}
          <ol className="sources">
            {car.sources.map((src, i) => (
              <li key={src.url}>
                <span>{i + 1}</span>
                <a href={src.url} target="_blank" rel="noreferrer">
                  {src.label}
                </a>
              </li>
            ))}
          </ol>
        </div>
    </aside>
  )
}

function Cite({ sources, n }: { sources: Source[]; n: number }) {
  const src = sources[n]
  return (
    <a className="cite" href={src.url} target="_blank" rel="noreferrer" title={src.label}>
      {n + 1}
    </a>
  )
}

export function Toolbar({ onReset }: { onReset: () => void }) {
  const s = useStore()
  const items = [
    { label: 'Map', icon: <IconMap />, active: s.mapOpen, onClick: s.openMap },
    ...(s.mode === 'city' ? [{ label: 'Studio', icon: <IconStudio />, active: false, onClick: s.exitCity }] : []),
    { label: 'Rotate', icon: <IconRotate />, active: s.autoRotate, onClick: s.toggleAutoRotate },
    { label: 'Reset', icon: <IconReset />, active: false, onClick: onReset },
  ]
  return (
    <nav className="toolbar">
      {items.map((it) => (
        <button key={it.label} className={it.active ? 'active' : ''} onClick={it.onClick} aria-pressed={it.active}>
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  )
}

export function PaintPicker() {
  const paint = useStore((s) => s.paint)
  const setPaint = useStore((s) => s.setPaint)
  const custom = !PAINTS.some((p) => p.name === paint.name)
  return (
    <div className="paint">
      <span className="paint-name">{paint.name}</span>
      <div className="swatches">
        {PAINTS.map((p) => (
          <button
            key={p.name}
            className={`swatch ${p.color ? '' : 'original'} ${p.name === paint.name ? 'active' : ''}`}
            style={p.color ? { background: p.color } : undefined}
            onClick={() => setPaint(p)}
            title={p.color ? p.name : "Original — the car's factory paint"}
            aria-label={p.color ? p.name : 'Original paint'}
          />
        ))}
        <label className={`swatch custom ${custom ? 'active' : ''}`} title="Custom colour">
          <input
            type="color"
            value={custom ? paint.color : '#3a6ea5'}
            onChange={(e) => setPaint({ name: 'Custom', color: e.target.value, metallic: 0.5, roughness: 0.3 })}
          />
        </label>
      </div>
    </div>
  )
}

export function Loader() {
  const { progress } = useProgress()
  // the splash ends once the first car is rigged and on screen; later downloads (other cars,
  // city tiles) go through the same loading manager and must not bring it back
  const done = useStore((s) => s.loaded)
  return (
    <div className={`loader ${done ? 'done' : ''}`}>
      <span className="wordmark">PORSCHE</span>
      <div className="bar">
        <div style={{ width: `${Math.max(progress, 4)}%` }} />
      </div>
      <span className="pct">{Math.round(progress)}%</span>
    </div>
  )
}

const CAM_LABEL: Record<CamView, { label: string; icon: React.ReactNode }> = {
  interior: { label: 'Cockpit', icon: <IconCockpit width={16} height={16} /> },
  chase: { label: 'Chase', icon: <IconChase width={16} height={16} /> },
  far: { label: 'Bird’s-eye', icon: <IconBird width={16} height={16} /> },
}

/** Driving camera picker (city only); C cycles through the views. */
function CamViews() {
  const camView = useStore((s) => s.camView)
  const setCamView = useStore((s) => s.setCamView)
  return (
    <div className="cam-views" role="radiogroup" aria-label="Camera">
      {CAM_VIEWS.map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={camView === v}
          className={camView === v ? 'on' : ''}
          onClick={() => setCamView(v)}
          title={`${CAM_LABEL[v].label} view (C to switch)`}
          aria-label={`${CAM_LABEL[v].label} view`}
        >
          {CAM_LABEL[v].icon}
        </button>
      ))}
    </div>
  )
}

/** Speed readout + key hint; on touch screens also a small drive pad. */
export function DriveHud() {
  const speed = useRef<HTMLSpanElement>(null)
  const inCity = useStore((s) => s.mode === 'city')

  useEffect(() => {
    if (!inCity) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyC' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el?.tagName === 'INPUT' || el?.closest?.('.map-overlay')) return
      useStore.getState().cycleCamView()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inCity])
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (speed.current) speed.current.textContent = String(Math.round(Math.abs(drive.speed) * 3.6))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const hold = (k: keyof typeof drive.keys) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      drive.keys[k] = true
    },
    onPointerUp: () => (drive.keys[k] = false),
    onPointerCancel: () => (drive.keys[k] = false),
  })

  return (
    <div className="drive-hud">
      <div className="speedo-row">
        {inCity && <CamViews />}
        <div className="speedo">
          <span ref={speed} className="speed-value">0</span>
          <span className="speed-unit">km/h</span>
        </div>
      </div>
      <div className="keys-hint">
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        <kbd>←</kbd>
        <kbd>→</kbd>
        <span>drive</span>
        {inCity && (
          <>
            <kbd className="kbd-gap">C</kbd>
            <span>view</span>
          </>
        )}
      </div>
      <div className="touch-pad">
        <button {...hold('left')} aria-label="Steer left">←</button>
        <div className="touch-pad-col">
          <button {...hold('up')} aria-label="Accelerate">↑</button>
          <button {...hold('down')} aria-label="Brake / reverse">↓</button>
        </div>
        <button {...hold('right')} aria-label="Steer right">→</button>
      </div>
    </div>
  )
}

/** Showroom overlay: the car in the spotlight — year, model and sourced specs — with ← → to browse. */
export function ShowroomOverlay() {
  const mode = useStore((s) => s.mode)
  const index = useStore((s) => s.showroomIndex)
  const step = useStore((s) => s.stepShowroom)
  const setCar = useStore((s) => s.setCar)
  const close = useStore((s) => s.closeShowroom)
  const car = CARS[index]

  useEffect(() => {
    if (mode !== 'showroom') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'Enter') {
        setCar(CARS[useStore.getState().showroomIndex].id)
        close()
      } else if (e.key === 'Escape') close()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, step, setCar, close])

  if (mode !== 'showroom') return null
  return (
    <div className="showroom">
      <div className="showroom-info" key={car.id}>
        <span className="showroom-year">{car.year}</span>
        <h1>
          {car.name}
          <small>{car.code}</small>
        </h1>
        <p className="tagline">{car.tagline}</p>
        <dl className="specs">
          {car.specs.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>
                {s.value}
                <Cite sources={car.sources} n={s.src} />
              </dd>
            </div>
          ))}
        </dl>
        <ol className="sources">
          {car.sources.map((src, i) => (
            <li key={src.url}>
              <span>{i + 1}</span>
              <a href={src.url} target="_blank" rel="noreferrer">
                {src.label}
              </a>
            </li>
          ))}
        </ol>
      </div>

      <div className="showroom-nav">
        <button className="showroom-arrow" onClick={() => step(-1)} aria-label="Previous car">
          ←
        </button>
        <ol className="showroom-years">
          {CARS.map((c, i) => (
            <li key={c.id}>
              <button className={i === index ? 'active' : ''} onClick={() => step(i - index)} title={c.name}>
                {c.year}
              </button>
            </li>
          ))}
        </ol>
        <button className="showroom-arrow" onClick={() => step(1)} aria-label="Next car">
          →
        </button>
      </div>

      <div className="showroom-actions">
        <button
          className="drive-btn"
          onClick={() => {
            setCar(car.id)
            close()
          }}
        >
          Drive the {car.name}
        </button>
        <button className="link-btn" onClick={close}>
          Back to studio
        </button>
      </div>
    </div>
  )
}
