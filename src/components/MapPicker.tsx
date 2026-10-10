import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStore, type CityPick } from '../store'
import { CITIES } from '../data/cities'
import { IconClose } from './Icons'

// OpenStreetMap's standard tiles (no key; dark mode is a CSS filter on the tile pane)
const BASEMAP = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
// Photon (komoot): free OSM geocoder that allows search-as-you-type
const GEOCODER = 'https://photon.komoot.io/api/'

interface Place extends CityPick {
  id: string
  note: string
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: { osm_id?: number; osm_type?: string; name?: string; city?: string; state?: string; country?: string; street?: string }
}

async function searchPlaces(q: string, signal: AbortSignal): Promise<Place[]> {
  const res = await fetch(`${GEOCODER}?q=${encodeURIComponent(q)}&limit=6`, { signal })
  if (!res.ok) throw new Error(`search ${res.status}`)
  const j: { features: PhotonFeature[] } = await res.json()
  return j.features.map((f, i) => {
    const p = f.properties
    const [lon, lat] = f.geometry.coordinates
    const name = p.name ?? p.street ?? p.city ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`
    const note = [p.city !== name ? p.city : null, p.state, p.country].filter(Boolean).join(', ')
    return { id: `${p.osm_type}${p.osm_id ?? i}`, name, note, lat, lon }
  })
}

/** Full-screen map: pick a preset city or click anywhere, then drive there. */
export function MapPicker() {
  const open = useStore((s) => s.mapOpen)
  const dark = useStore((s) => s.dark)
  const closeMap = useStore((s) => s.closeMap)
  const enterCity = useStore((s) => s.enterCity)
  const current = useStore((s) => s.city)
  const ionToken = useStore((s) => s.ionToken)
  const tokenFromEnv = useStore((s) => s.tokenFromEnv)
  const setIonToken = useStore((s) => s.setIonToken)
  const cityLook = useStore((s) => s.cityLook)
  const setCityLook = useStore((s) => s.setCityLook)
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState<'idle' | 'busy' | 'error'>('idle')

  // search as you type (debounced; stale requests are aborted)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching('idle')
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      setSearching('busy')
      searchPlaces(q, ctrl.signal)
        .then((r) => {
          setResults(r)
          setSearching('idle')
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setSearching('error')
        })
    }, 350)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query])
  const [pick, setPick] = useState<CityPick>(current ?? CITIES[0])
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.CircleMarker | null>(null)

  useEffect(() => {
    if (!open || !el.current) return
    const m = L.map(el.current, { zoomControl: false, worldCopyJump: true }).setView([pick.lat, pick.lon], 13)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    L.tileLayer(BASEMAP, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m)
    marker.current = L.circleMarker([pick.lat, pick.lon], {
      radius: 9,
      color: '#fff',
      weight: 3,
      fillColor: '#d5001c',
      fillOpacity: 1,
    }).addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng.wrap()
      setPick({ name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lon: lng })
    })
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    marker.current?.setLatLng([pick.lat, pick.lon])
  }, [pick])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMap()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeMap])

  if (!open) return null

  const choose = (c: CityPick) => {
    setPick({ name: c.name, lat: c.lat, lon: c.lon })
    map.current?.flyTo([c.lat, c.lon], 15, { duration: 1.2 })
  }
  const searchActive = query.trim().length >= 2
  const list: (CityPick & { note: string; id?: string })[] = searchActive ? results : CITIES

  return (
    <div className="map-overlay" role="dialog" aria-label="Choose a city">
      <div className="map-card">
        <aside className="map-side">
          <span className="eyebrow">Drive in</span>
          <h2>Choose a city</h2>
          <p className="body-text">Search a place, pick a city, or click anywhere on the map.</p>
          <div className="search">
            <input
              type="search"
              placeholder="Search a city or street…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) choose(results[0])
                if (e.key === 'Escape' && query) {
                  e.stopPropagation()
                  setQuery('')
                }
              }}
              aria-label="Search a place"
            />
            {searching === 'busy' && <i className="spinner" />}
          </div>
          <ul className={`city-list ${searchActive ? 'results' : ''}`}>
            {list.map((c) => (
              <li key={c.id ?? c.name}>
                <button
                  className={pick.lat === c.lat && pick.lon === c.lon ? 'active' : ''}
                  onClick={() => choose(c)}
                  title={c.note ? `${c.name}, ${c.note}` : c.name}
                >
                  <strong>{c.name}</strong>
                  <span>{c.note}</span>
                </button>
              </li>
            ))}
            {searchActive && searching !== 'busy' && !results.length && (
              <li className="search-empty">{searching === 'error' ? 'Search is unavailable right now.' : 'No places found.'}</li>
            )}
          </ul>
          {searchActive && <p className="search-credit">Search by Photon · © OpenStreetMap</p>}
          <section className="look">
            <div className="tabs look-tabs">
              <button className={cityLook === 'photoreal' ? 'active' : ''} onClick={() => setCityLook('photoreal')}>
                Photoreal
              </button>
              <button className={cityLook === 'osm' ? 'active' : ''} onClick={() => setCityLook('osm')}>
                Blocks
              </button>
            </div>
            {cityLook === 'photoreal' &&
              (ionToken ? (
                <p className="look-note">
                  Google Photorealistic 3D Tiles via Cesium ion.{' '}
                  {!tokenFromEnv && (
                    <button className="link-btn" onClick={() => setIonToken('')}>
                      Remove token
                    </button>
                  )}
                </p>
              ) : (
                <form
                  className="token-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    setIonToken(draft)
                    setDraft('')
                  }}
                >
                  <p className="look-note">
                    Needs a free{' '}
                    <a href="https://ion.cesium.com/tokens" target="_blank" rel="noreferrer">
                      Cesium ion token
                    </a>
                    . Restrict it to this site's URL. Without one, the city is drawn as blocks.
                  </p>
                  <div className="token-row">
                    <input
                      type="password"
                      placeholder="Paste Cesium ion token"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button type="submit" disabled={!draft.trim()}>
                      Save
                    </button>
                  </div>
                </form>
              ))}
          </section>
          <button className="drive-btn" onClick={() => enterCity(pick)}>
            Drive in {pick.name}
          </button>
        </aside>
        <div className={`map-wrap ${dark ? 'dark' : ''}`}>
          <div ref={el} className="map" />
          <button className="panel-close map-close" onClick={closeMap} aria-label="Close map">
            <IconClose width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
