import { create } from 'zustand'
import { PAINTS, type Paint } from './data/car'
import { CARS, DEFAULT_CAR } from './data/cars'

export interface CityPick {
  name: string
  lat: number
  lon: number
}

const TOKEN_KEY = 'porsche930.ionToken'
const LOOK_KEY = 'porsche930.cityLook'
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
      photorealError: '',
      // photoreal tiles are photographed in daylight: night mode isn't offered there
      dark: s.cityLook === 'photoreal' && s.ionToken ? false : s.dark,
    })),
  exitCity: () => set({ mode: 'studio', city: null, cityStatus: '' }),
  setCityStatus: (cityStatus) => set({ cityStatus }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
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
