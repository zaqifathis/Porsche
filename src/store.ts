import { create } from 'zustand'
import { PAINTS, type Paint } from './data/car'
import { CARS, DEFAULT_CAR } from './data/cars'
import { CITIES } from './data/cities'
import { GEMS_PER_CITY, type Guide } from './game/state'

export interface CityPick {
  name: string
  lat: number
  lon: number
}

const TOKEN_KEY = 'porsche930.ionToken'
const LOOK_KEY = 'porsche930.cityLook'
const GUIDE_KEY = 'porsche930.guide'
const CAM_KEY = 'porsche930.camView'
const readLocal = (k: string) => {
  try {
    return localStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}
const writeLocal = (k: string, v: string) => {
  try {
    if (v) localStorage.setItem(k, v)
    else localStorage.removeItem(k)
  } catch {
    // storage blocked (private mode): keep it for this session only
  }
}
/** A token baked in at build time (`.env.local`) wins; otherwise one pasted in the map picker. */
const ENV_TOKEN = (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined) ?? ''

export type CityLook = 'photoreal' | 'osm'
/** Driving camera in a city: from the driver's seat, behind the car, or high and far behind. */
export type CamView = 'interior' | 'chase' | 'far'
export const CAM_VIEWS: CamView[] = ['interior', 'chase', 'far']

interface State {
  /** Cesium ion access token for Google Photorealistic 3D Tiles ('' = none). */
  ionToken: string
  tokenFromEnv: boolean
  cityLook: CityLook
  /** Set when Cesium ion rejects the tileset (bad/expired token); the city falls back to blocks. */
  photorealError: string
  setPhotorealError: (e: string) => void
  setIonToken: (t: string) => void
  setCityLook: (l: CityLook) => void
  /** Selected car (id from data/cars.ts). */
  carId: string
  setCar: (id: string) => void
  /** Car under the spotlight in the showroom carousel (index into CARS). */
  showroomIndex: number
  openShowroom: () => void
  closeShowroom: () => void
  stepShowroom: (d: number) => void
  mode: 'studio' | 'city' | 'showroom'
  city: CityPick | null
  mapOpen: boolean
  cityStatus: string
  muted: boolean
  openMap: () => void
  closeMap: () => void
  enterCity: (c: CityPick) => void
  exitCity: () => void
  setCityStatus: (s: string) => void
  toggleMuted: () => void
  /** Diamonds collected in the current city (the portal opens at GEMS_PER_CITY). */
  gems: number
  collectGem: () => void
  /** True during the time-travel transition to the next city. */
  warping: boolean
  /** Fly through the portal: flash out, load a random other city, flash back in. */
  warp: () => void
  /** How the way to the next diamond is shown. */
  guide: Guide
  setGuide: (g: Guide) => void
  camView: CamView
  setCamView: (v: CamView) => void
  /** Step to the next camera view (the C key). */
  cycleCamView: () => void
  dark: boolean
  paint: Paint
  autoRotate: boolean
  loaded: boolean
  toggleDark: () => void
  setPaint: (p: Paint) => void
  toggleAutoRotate: () => void
  setLoaded: () => void
}

/** Photoreal tiles are on screen (city mode, photoreal look, a token, and no error). */
export const photorealActive = (s: Pick<State, 'mode' | 'cityLook' | 'ionToken' | 'photorealError'>) =>
  s.mode === 'city' && s.cityLook === 'photoreal' && !!s.ionToken && !s.photorealError

export const useStore = create<State>((set) => ({
  ionToken: ENV_TOKEN || readLocal(TOKEN_KEY),
  tokenFromEnv: !!ENV_TOKEN,
  cityLook: readLocal(LOOK_KEY) === 'osm' ? 'osm' : 'photoreal',
  photorealError: '',
  setPhotorealError: (photorealError) => set({ photorealError }),
  setIonToken: (t) => {
    const ionToken = t.trim()
    writeLocal(TOKEN_KEY, ionToken)
    set({ ionToken, photorealError: '' })
  },
  setCityLook: (cityLook) => {
    writeLocal(LOOK_KEY, cityLook)
    set((s) => ({ cityLook, dark: s.mode === 'city' && cityLook === 'photoreal' && s.ionToken ? false : s.dark }))
  },
  carId: DEFAULT_CAR,
  setCar: (carId) => set({ carId }),
  showroomIndex: Math.max(0, CARS.findIndex((c) => c.id === DEFAULT_CAR)),
  openShowroom: () =>
    set((s) => ({
      mode: 'showroom',
      city: null,
      cityStatus: '',
      mapOpen: false,
      showroomIndex: Math.max(0, CARS.findIndex((c) => c.id === s.carId)),
    })),
  closeShowroom: () => set({ mode: 'studio' }),
  stepShowroom: (d) => set((s) => ({ showroomIndex: (s.showroomIndex + d + CARS.length) % CARS.length })),
  mode: 'studio',
  city: null,
  mapOpen: false,
  cityStatus: '',
  muted: false,
  openMap: () => set({ mapOpen: true }),
  closeMap: () => set({ mapOpen: false }),
  enterCity: (city) =>
    set((s) => ({
      mode: 'city',
      city,
      mapOpen: false,
      gems: 0,
      photorealError: '',
      // photoreal tiles are photographed in daylight: night mode isn't offered there
      dark: s.cityLook === 'photoreal' && s.ionToken ? false : s.dark,
    })),
  exitCity: () => set({ mode: 'studio', city: null, cityStatus: '', gems: 0, warping: false }),
  setCityStatus: (cityStatus) => set({ cityStatus }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  gems: 0,
  collectGem: () => set((s) => ({ gems: Math.min(GEMS_PER_CITY, s.gems + 1) })),
  warping: false,
  warp: () => {
    if (useStore.getState().warping) return
    set({ warping: true })
    // swap the city while the screen is washed out, then let the flash fade
    setTimeout(() => {
      const s = useStore.getState()
      if (!s.warping) return // left the city mid-warp
      const others = CITIES.filter((c) => c.name !== s.city?.name)
      const next = others[Math.floor(Math.random() * others.length)]
      s.enterCity({ name: next.name, lat: next.lat, lon: next.lon })
    }, 900)
    setTimeout(() => set({ warping: false }), 2200)
  },
  guide: readLocal(GUIDE_KEY) === 'arrow' ? 'arrow' : 'route',
  setGuide: (guide) => {
    writeLocal(GUIDE_KEY, guide)
    set({ guide })
  },
  camView: (CAM_VIEWS as string[]).includes(readLocal(CAM_KEY)) ? (readLocal(CAM_KEY) as CamView) : 'chase',
  setCamView: (camView) => {
    writeLocal(CAM_KEY, camView)
    set({ camView })
  },
  cycleCamView: () => {
    const { camView, setCamView } = useStore.getState()
    setCamView(CAM_VIEWS[(CAM_VIEWS.indexOf(camView) + 1) % CAM_VIEWS.length])
  },
  dark: false,
  paint: PAINTS[1],
  autoRotate: false,
  loaded: false,
  toggleDark: () => set((s) => (photorealActive(s) ? {} : { dark: !s.dark })),
  setPaint: (paint) => set({ paint }),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  setLoaded: () => set({ loaded: true }),
}))

if (import.meta.env.DEV) Object.assign(window, { __store: useStore })
