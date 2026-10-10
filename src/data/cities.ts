import type { CityPick } from '../store'

/** Start points: a recognisable street in each city (the car snaps to the nearest road). */
export const CITIES: (CityPick & { note: string })[] = [
  { name: 'Jakarta', note: 'Bundaran HI, Jl. M.H. Thamrin', lat: -6.1951, lon: 106.8231 },
  { name: 'London', note: 'Trafalgar Square', lat: 51.508, lon: -0.1281 },
  { name: 'Berlin', note: 'Unter den Linden', lat: 52.5169, lon: 13.3889 },
  { name: 'New York', note: 'Times Square', lat: 40.758, lon: -73.9855 },
  { name: 'Tokyo', note: 'Shibuya Crossing', lat: 35.6595, lon: 139.7005 },
  { name: 'Dubai', note: 'Downtown', lat: 25.1972, lon: 55.2744 },
]
