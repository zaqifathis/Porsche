/** Slippy-map tile maths + a local metric projection centred on the chosen city. */

/** Zoom level the city is streamed and rendered in (≈ 400–600 m tiles). */
export const TILE_Z = 16
/** Highest zoom the vector source provides; each data tile covers 4×4 render tiles. */
export const DATA_Z = 14

export interface TileXY {
  x: number
  y: number
}

export function lonLatToTile(lon: number, lat: number, z: number): TileXY {
  const n = 2 ** z
  const r = (lat * Math.PI) / 180
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n,
  }
}

/** Fractional tile coordinates → lon/lat (top-left corner for whole numbers). */
export function tileToLonLat(x: number, y: number, z: number): { lon: number; lat: number } {
  const n = 2 ** z
  const lon = (x / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  return { lon, lat }
}

export const tileKey = (x: number, y: number) => `${x}/${y}`

/**
 * Equirectangular projection in metres around (lat0, lon0): +x east, -z north (so +z is south).
 * Accurate to well under a metre over the few kilometres we stream.
 */
export class Projector {
  readonly lat0: number
  readonly lon0: number
  readonly kx: number
  readonly kz = 110574
  constructor(lat0: number, lon0: number) {
    this.lat0 = lat0
    this.lon0 = lon0
    this.kx = 111320 * Math.cos((lat0 * Math.PI) / 180)
  }
  toLocal(lon: number, lat: number): [number, number] {
    return [(lon - this.lon0) * this.kx, -(lat - this.lat0) * this.kz]
  }
  toLonLat(x: number, z: number): { lon: number; lat: number } {
    return { lon: this.lon0 + x / this.kx, lat: this.lat0 - z / this.kz }
  }
}
