import { VectorTile, classifyRings } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { DATA_Z, TILE_Z, lonLatToTile, tileKey, tileToLonLat, type Projector } from './geo'

/** OpenFreeMap serves OpenMapTiles vector tiles (OSM data) without an API key. */
const TILEJSON = 'https://tiles.openfreemap.org/planet'

export interface Building {
  /** Outer ring then holes, each as flat [x0, z0, x1, z1, …] in local metres. */
  rings: number[][]
  height: number
  minHeight: number
  bbox: [number, number, number, number] // minX, minZ, maxX, maxZ
  shade: number // 0..1, for a little colour variation
}

export interface RoadLine {
  cls: string
  width: number
  pts: number[] // flat [x0, z0, x1, z1, …]
}

type Ring = { x: number; y: number }[]
interface Area {
  kind: 'water' | 'park' | 'green' | 'sand'
  rings: Ring[]
}
interface DataTile {
  extent: number
  areas: Area[]
}

const GROUND = {
  light: { base: '#ece8e1', water: '#a8c9e4', park: '#cfe2c0', green: '#d9e6c9', sand: '#efe3c4' },
  dark: { base: '#14161a', water: '#0d1b29', park: '#16241a', green: '#18221a', sand: '#24221b' },
}
const GREEN = new Set(['grass', 'wood', 'forest', 'wetland', 'farmland', 'scrub'])

/** Everything that falls into one render tile (z16), in local metres. */
export interface TileContent {
  buildings: Building[]
  roads: RoadLine[]
}

export const ROAD_WIDTH: Record<string, number> = {
  motorway: 16,
  trunk: 14,
  primary: 12,
  secondary: 10,
  tertiary: 9,
  minor: 7,
  service: 4.5,
  track: 3.5,
}
/** Road classes a car can sensibly start on. */
export const DRIVABLE_START = new Set(['primary', 'secondary', 'tertiary', 'minor'])

let template: Promise<string> | null = null
function tileUrlTemplate(): Promise<string> {
  template ??= fetch(TILEJSON)
    .then((r) => {
      if (!r.ok) throw new Error(`TileJSON ${r.status}`)
      return r.json()
    })
    .then((j: { tiles: string[] }) => j.tiles[0])
    .catch((e) => {
      template = null
      throw e
    })
  return template
}

/**
 * Downloads and decodes z14 vector tiles, then buckets buildings and road segments into
 * the z16 render tiles they belong to. One instance per city (coordinates depend on its origin).
 */
export class VectorSource {
  private readonly proj: Projector
  private readonly data = new Map<string, Promise<void>>()
  private readonly buckets = new Map<string, TileContent>()
  private readonly raw = new Map<string, DataTile>()

  constructor(proj: Projector) {
    this.proj = proj
  }

  /** Resolves with the content of render tile (x, y) at TILE_Z once its data tile has loaded. */
  async tile(x: number, y: number): Promise<TileContent> {
    await this.ensure(x, y)
    return this.buckets.get(tileKey(x, y)) ?? { buildings: [], roads: [] }
  }

  /** Paint render tile (x, y)'s ground (land, water, parks) into a canvas, 512 px square. */
  async ground(x: number, y: number, dark: boolean, canvas: HTMLCanvasElement) {
    const { dx, dy } = await this.ensure(x, y)
    const data = this.raw.get(tileKey(dx, dy))
    const pal = dark ? GROUND.dark : GROUND.light
    const size = canvas.width
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = pal.base
    ctx.fillRect(0, 0, size, size)
    if (!data) return
    const sub = 2 ** (TILE_Z - DATA_Z)
    const k = (size * sub) / data.extent
    ctx.setTransform(k, 0, 0, k, -(x - dx * sub) * size, -(y - dy * sub) * size)
    for (const kind of ['green', 'sand', 'park', 'water'] as const) {
      ctx.fillStyle = pal[kind]
      ctx.beginPath()
      for (const a of data.areas) {
        if (a.kind !== kind) continue
        for (const r of a.rings) {
          ctx.moveTo(r[0].x, r[0].y)
          for (let i = 1; i < r.length; i++) ctx.lineTo(r[i].x, r[i].y)
          ctx.closePath()
        }
      }
      ctx.fill('evenodd')
    }
  }

  private async ensure(x: number, y: number) {
    const s = 2 ** (TILE_Z - DATA_Z)
    const dx = Math.floor(x / s)
    const dy = Math.floor(y / s)
    const key = tileKey(dx, dy)
    let p = this.data.get(key)
    if (!p) {
      p = this.load(dx, dy).catch((e) => {
        this.data.delete(key)
        throw e
      })
      this.data.set(key, p)
    }
    await p
    return { dx, dy }
  }

  private bucket(lx: number, lz: number): TileContent {
    const { lon, lat } = this.proj.toLonLat(lx, lz)
    const t = lonLatToTile(lon, lat, TILE_Z)
    const key = tileKey(Math.floor(t.x), Math.floor(t.y))
    let b = this.buckets.get(key)
    if (!b) this.buckets.set(key, (b = { buildings: [], roads: [] }))
    return b
  }

  private async load(tx: number, ty: number) {
    const url = (await tileUrlTemplate()).replace('{z}', String(DATA_Z)).replace('{x}', String(tx)).replace('{y}', String(ty))
    const res = await fetch(url)
    if (!res.ok) throw new Error(`tile ${tx}/${ty}: ${res.status}`)
    const vt = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())))

    const toLocal = (px: number, py: number, extent: number): [number, number] => {
      const { lon, lat } = tileToLonLat(tx + px / extent, ty + py / extent, DATA_Z)
      return this.proj.toLocal(lon, lat)
    }

    const bl = vt.layers.building
    for (let i = 0; bl && i < bl.length; i++) {
      const f = bl.feature(i)
      if (f.type !== 3 || f.properties.hide_3d) continue
      const height = Number(f.properties.render_height) || 8
      const minHeight = Number(f.properties.render_min_height) || 0
      for (const poly of classifyRings(f.loadGeometry())) {
        const rings = poly.map((ring) => {
          const flat: number[] = []
          // rings are closed (last point repeats the first): drop the duplicate
          for (let k = 0; k < ring.length - 1; k++) flat.push(...toLocal(ring[k].x, ring[k].y, bl.extent))
          return flat
        })
        if (rings[0].length < 6) continue
        let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
        const outer = rings[0]
        for (let k = 0; k < outer.length; k += 2) {
          minX = Math.min(minX, outer[k]); maxX = Math.max(maxX, outer[k])
          minZ = Math.min(minZ, outer[k + 1]); maxZ = Math.max(maxZ, outer[k + 1])
        }
        const shade = ((Math.abs(Math.sin(minX * 12.9898 + minZ * 78.233)) * 43758.5453) % 1 + 1) % 1
        this.bucket((minX + maxX) / 2, (minZ + maxZ) / 2).buildings.push({
          rings,
          height: Math.max(height, minHeight + 2),
          minHeight,
          bbox: [minX, minZ, maxX, maxZ],
          shade,
        })
      }
    }

    // ground areas stay in tile pixel space; they are only ever painted into textures
    const areas: Area[] = []
    const addAreas = (layer: string, kindOf: (cls: string) => Area['kind'] | null) => {
      const l = vt.layers[layer]
      for (let i = 0; l && i < l.length; i++) {
        const f = l.feature(i)
        const kind = kindOf(String(f.properties.class))
        if (f.type === 3 && kind) areas.push({ kind, rings: f.loadGeometry() })
      }
      return l?.extent
    }
    const extents = [
      addAreas('water', () => 'water'),
      addAreas('park', () => 'park'),
      addAreas('landcover', (c) => (GREEN.has(c) ? 'green' : c === 'sand' || c === 'beach' ? 'sand' : null)),
    ]
    this.raw.set(tileKey(tx, ty), { extent: extents.find((e) => e) ?? 4096, areas })

    const tl = vt.layers.transportation
    for (let i = 0; tl && i < tl.length; i++) {
      const f = tl.feature(i)
      const cls = String(f.properties.class)
      const width = ROAD_WIDTH[cls]
      if (f.type !== 2 || !width || f.properties.brunnel === 'tunnel') continue
      for (const line of f.loadGeometry()) {
        // split each line into runs of consecutive segments that share a render tile
        let run: number[] = []
        let owner: TileContent | null = null
        for (let k = 0; k < line.length - 1; k++) {
          const a = toLocal(line[k].x, line[k].y, tl.extent)
          const b = toLocal(line[k + 1].x, line[k + 1].y, tl.extent)
          const o = this.bucket((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
          if (o !== owner) {
            if (owner && run.length >= 4) owner.roads.push({ cls, width, pts: run })
            owner = o
            run = [...a]
          }
          run.push(...b)
        }
        if (owner && run.length >= 4) owner.roads.push({ cls, width, pts: run })
      }
    }
  }
}
