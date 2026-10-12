import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStore } from '../store'
import { drive } from '../scene/drive'
import { Projector } from '../city/geo'
import { GEMS_PER_CITY, game } from '../game/state'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

/** Small north-up map in the corner that follows the car while driving in a city. */
export function MiniMap() {
  const city = useStore((s) => s.city)
  const mode = useStore((s) => s.mode)
  const dark = useStore((s) => s.dark)
  const openMap = useStore((s) => s.openMap)
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode !== 'city' || !city || !el.current) return
    const proj = new Projector(city.lat, city.lon)
    const map = L.map(el.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    }).setView([city.lat, city.lon], 16)
    L.tileLayer(TILES, { maxZoom: 19 }).addTo(map)
    const arrow = L.marker([city.lat, city.lon], {
      icon: L.divIcon({ className: 'minimap-car', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      interactive: false,
    }).addTo(map)
    const goal = L.marker([city.lat, city.lon], {
      icon: L.divIcon({ className: 'minimap-goal', html: '<span></span>', iconSize: [14, 14], iconAnchor: [7, 7] }),
      interactive: false,
    })

    // follow the car ~10×/s; local +z is south, so compass bearing = atan2(east, north)
    let last = 0
    let raf = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < 100) return
      last = now
      const { lat, lon } = proj.toLonLat(drive.position.x, drive.position.z)
      map.setView([lat, lon], map.getZoom(), { animate: false })
      arrow.setLatLng([lat, lon])
      const bearing = (Math.atan2(Math.sin(drive.heading), -Math.cos(drive.heading)) * 180) / Math.PI
      const span = arrow.getElement()?.firstElementChild as HTMLElement | null
      if (span) span.style.transform = `rotate(${bearing}deg)`
      // the diamond (or portal) being hunted
      if (game.target) {
        const g = proj.toLonLat(game.target.x, game.target.z)
        goal.setLatLng([g.lat, g.lon])
        if (!map.hasLayer(goal)) goal.addTo(map)
        goal.getElement()?.classList.toggle('portal', useStore.getState().gems >= GEMS_PER_CITY)
      } else if (map.hasLayer(goal)) goal.remove()
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      map.remove()
    }
  }, [mode, city])

  if (mode !== 'city' || !city) return null
  return (
    <button className={`minimap ${dark ? 'dark' : ''}`} onClick={openMap} aria-label="Open the city map" title="Open map">
      <div ref={el} className="minimap-map" />
    </button>
  )
}
