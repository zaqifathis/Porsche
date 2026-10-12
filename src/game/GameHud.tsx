import { useEffect, useRef } from 'react'
import { drive } from '../scene/drive'
import { useStore } from '../store'
import { GEMS_PER_CITY, game } from './state'

/** Diamond counter + compass to the next target, and the full-screen flash while warping. */
export function GameHud() {
  const mode = useStore((s) => s.mode)
  const city = useStore((s) => s.city)
  const gems = useStore((s) => s.gems)
  const warping = useStore((s) => s.warping)
  const guide = useStore((s) => s.guide)
  const setGuide = useStore((s) => s.setGuide)
  const needle = useRef<HTMLSpanElement>(null)
  const dist = useRef<HTMLSpanElement>(null)
  const active = mode === 'city' && !!city
  const portalOpen = gems >= GEMS_PER_CITY

  useEffect(() => {
    if (!active) return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const t = game.target
      if (!needle.current || !dist.current) return
      if (!t) {
        dist.current.textContent = '…'
        needle.current.style.opacity = '0.3'
        return
      }
      const dx = t.x - drive.position.x, dz = t.z - drive.position.z
      const m = Math.hypot(dx, dz)
      dist.current.textContent = m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
      // up = straight ahead; heading grows to the left, so a target on the left turns the needle anticlockwise
      const rel = Math.atan2(dx, dz) - drive.heading
      needle.current.style.opacity = '1'
      needle.current.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  return (
    <>
      {active && (
        <div className={`game-hud ${portalOpen ? 'portal' : ''}`} key={city.name}>
          <span className="game-count">
            <i className="game-gem" />
            <strong key={gems}>{gems}</strong>
            <span>/ {GEMS_PER_CITY}</span>
          </span>
          <span className="game-label">{portalOpen ? 'Portal open — drive through it' : 'Next diamond'}</span>
          <span className="game-compass">
            <span ref={needle} className="game-needle" />
          </span>
          <span ref={dist} className="game-dist">…</span>
          <span className="game-guide" role="radiogroup" aria-label="Guide">
            {(['route', 'arrow'] as const).map((g) => (
              <button key={g} role="radio" aria-checked={guide === g} className={guide === g ? 'on' : ''} onClick={() => setGuide(g)}>
                {g === 'route' ? 'Route' : 'Arrow'}
              </button>
            ))}
          </span>
        </div>
      )}
      {warping && <div className="warp" aria-hidden />}
    </>
  )
}
