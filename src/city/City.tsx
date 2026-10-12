import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Projector, TILE_Z, lonLatToTile, tileKey, tileToLonLat } from './geo'
import { DRIVABLE_START, VectorSource, type TileContent } from './vectorSource'
import { buildBuildings, buildRoads, inRing } from './buildMeshes'
import { drive } from '../scene/drive'
import { game } from '../game/state'
import { useStore, type CityPick } from '../store'

/** Render tiles kept around the car (radius 2 → 5×5 tiles ≈ 2 km across). */
const RADIUS = 2
const DROP_RADIUS = 3
const ROAD_Y = 0.04

const PALETTE_LIGHT = ['#e6dccb', '#d9cfbd', '#cfc6b8', '#e2ddd4', '#c4bdb2', '#d6cab4', '#bfc4c9'].map((c) => new THREE.Color(c))

interface Tile {
  x: number
  y: number
  group: THREE.Group
  ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>
  canvas: HTMLCanvasElement
  content: TileContent | null
}

interface Props {
  city: CityPick
  dark: boolean
  /**
   * Draw the OSM ground, buildings and roads. With photoreal tiles this is false: the OSM data
   * still streams for road placement, building collision and the mini-map, but isn't rendered.
   */
  visual?: boolean
  /** Called once the car has been put on a road (and again after a respawn). */
  onPlaced: () => void
}

/** Streams the chosen city as z16 tiles around the car: basemap ground, OSM buildings and roads. */
export function City({ city, dark, visual = true, onPlaced }: Props) {
  const proj = useMemo(() => new Projector(city.lat, city.lon), [city])
  const source = useMemo(() => new VectorSource(proj), [proj])
  const root = useMemo(() => new THREE.Group(), [])
  const tiles = useRef(new Map<string, Tile>())
  const pending = useRef(new Set<string>())
  const buildQueue = useRef<Tile[]>([])
  const placed = useRef(false)
  const timer = useRef(0)
  const darkRef = useRef(dark)
  const setCityStatus = useStore((s) => s.setCityStatus)

  const mats = useMemo(
    () => ({
      // plain massing: extruded footprints, no facade detail
      building: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
      road: new THREE.MeshStandardMaterial({ roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    }),
    [],
  )
  /** Paint the tile's ground (land, water, parks) from vector data into its canvas texture. */
  const loadGround = (t: Tile, isDark: boolean) => {
    source
      .ground(t.x, t.y, isDark, t.canvas)
      .then(() => {
        let tex = t.ground.material.map as THREE.CanvasTexture | null
        if (!tex) {
          tex = new THREE.CanvasTexture(t.canvas)
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = 8
          t.ground.material.map = tex
          t.ground.material.color.set('#ffffff')
          t.ground.material.needsUpdate = true
        }
        tex.needsUpdate = true
      })
      .catch(() => {})
  }

  // theme: building/road tint + basemap style
  useEffect(() => {
    darkRef.current = dark
    mats.building.color.set(dark ? '#4a4e57' : '#ffffff')
    mats.road.color.set(dark ? '#23262c' : '#80848b')
    if (visual) for (const t of tiles.current.values()) loadGround(t, dark)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, mats])

  /** Put the car on the drivable road closest to the city's chosen point. */
  const place = () => {
    let best = Infinity
    let bx = 0, bz = 0, bh = 0
    for (const t of tiles.current.values()) {
      for (const r of t.content?.roads ?? []) {
        if (!DRIVABLE_START.has(r.cls)) continue
        const p = r.pts
        for (let i = 0; i < p.length - 2; i += 2) {
          const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az
          const l2 = dx * dx + dz * dz
          if (l2 < 1) continue
          const s = Math.max(0, Math.min(1, -(ax * dx + az * dz) / l2))
          const x = ax + dx * s, z = az + dz * s
          const d = x * x + z * z
          if (d < best) {
            best = d
            bx = x
            bz = z
            bh = Math.atan2(dx, dz)
          }
        }
      }
    }
    drive.position.set(bx, 0, bz)
    drive.heading = bh
    drive.speed = 0
    drive.steer = 0
    drive.locked = false
    placed.current = true
    onPlaced()
  }

  // lifecycle: register collision + respawn, clean up everything on city change/unmount
  useEffect(() => {
    const all = tiles.current
    drive.locked = true
    placed.current = false
    drive.collide = (x, z) => {
      for (const t of all.values()) {
        for (const b of t.content?.buildings ?? []) {
          const [x0, z0, x1, z1] = b.bbox
          if (x < x0 || x > x1 || z < z0 || z > z1 || b.minHeight > 1.5) continue
          if (inRing(b.rings[0], x, z) && !b.rings.slice(1).some((h) => inRing(h, x, z))) return true
        }
      }
      return false
    }
    drive.respawn = () => place()
    game.sampleRoad = (cx, cz, min, max, classes) => {
      // random points along every loaded road of those classes, kept if they fall in the distance band
      const hits: { x: number; z: number; heading: number }[] = []
      for (const t of all.values()) {
        for (const r of t.content?.roads ?? []) {
          if (!classes.has(r.cls)) continue
          const p = r.pts
          for (let i = 0; i < p.length - 2; i += 2) {
            const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1]
            if (dx * dx + dz * dz < 25) continue
            const s = Math.random()
            const x = p[i] + dx * s, z = p[i + 1] + dz * s
            const d = Math.hypot(x - cx, z - cz)
            if (d >= min && d <= max) hits.push({ x, z, heading: Math.atan2(dx, dz) })
          }
        }
      }
      return hits.length ? hits[Math.floor(Math.random() * hits.length)] : null
    }
    game.roads = () => {
      const out = []
      for (const t of all.values()) if (t.content) out.push(...t.content.roads)
      return out
    }
    setCityStatus('Loading map data…')
    return () => {
      drive.collide = null
      drive.respawn = null
      game.sampleRoad = null
      game.roads = null
      drive.locked = false
      for (const t of all.values()) dispose(t)
      all.clear()
      pending.current.clear()
      buildQueue.current = []
      setCityStatus('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  useEffect(() => () => {
    mats.building.dispose()
    mats.road.dispose()
  }, [mats])

  function dispose(t: Tile) {
    root.remove(t.group)
    t.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry.dispose()
    })
    t.ground.material.map?.dispose()
    t.ground.material.dispose()
  }

  function makeTile(x: number, y: number): Tile {
    const nw = proj.toLocal(...lonLat(x, y))
    const se = proj.toLocal(...lonLat(x + 1, y + 1))
    const w = se[0] - nw[0]
    const h = se[1] - nw[1]
    const group = new THREE.Group()
    group.visible = visual
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ color: darkRef.current ? '#14161a' : '#ece8e1', roughness: 1 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.set(nw[0] + w / 2, 0, nw[1] + h / 2)
    ground.receiveShadow = true
    group.add(ground)
    root.add(group)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const t: Tile = { x, y, group, ground, canvas, content: null }
    if (visual) loadGround(t, darkRef.current)
    return t
  }

  useFrame((_, dt) => {
    // build at most one tile's meshes per frame to avoid hitches
    const next = buildQueue.current.shift()
    if (next && tiles.current.has(tileKey(next.x, next.y)) && next.content) {
      const b = buildBuildings(next.content.buildings, PALETTE_LIGHT)
      if (b) {
        const m = new THREE.Mesh(b, mats.building)
        m.receiveShadow = true
        next.group.add(m)
      }
      const r = buildRoads(next.content.roads, ROAD_Y)
      if (r) next.group.add(new THREE.Mesh(r, mats.road))
    }

    timer.current -= dt
    if (timer.current > 0) return
    timer.current = 0.3

    const { lon, lat } = proj.toLonLat(drive.position.x, drive.position.z)
    const c = lonLatToTile(lon, lat, TILE_Z)
    const cx = Math.floor(c.x)
    const cy = Math.floor(c.y)

    // unload far tiles
    for (const [k, t] of tiles.current) {
      if (Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)) > DROP_RADIUS) {
        if (t.content) game.roadsVersion++
        dispose(t)
        tiles.current.delete(k)
      }
    }

    // request missing tiles, nearest first
    const wanted: [number, number, number][] = []
    for (let dy = -RADIUS; dy <= RADIUS; dy++)
      for (let dx = -RADIUS; dx <= RADIUS; dx++) wanted.push([cx + dx, cy + dy, dx * dx + dy * dy])
    wanted.sort((a, b) => a[2] - b[2])
    for (const [x, y] of wanted) {
      const k = tileKey(x, y)
      if (tiles.current.has(k) || pending.current.has(k)) continue
      pending.current.add(k)
      const t = makeTile(x, y)
      tiles.current.set(k, t)
      source
        .tile(x, y)
        .then((content) => {
          pending.current.delete(k)
          if (tiles.current.get(k) !== t) return
          t.content = content
          game.roadsVersion++
          if (visual) buildQueue.current.push(t)
          if (!placed.current && x === cx && y === cy) {
            // wait one frame so the centre tile's meshes exist before the car lands
            requestAnimationFrame(() => {
              place()
              setCityStatus('')
            })
          }
        })
        .catch(() => {
          pending.current.delete(k)
          dispose(t)
          tiles.current.delete(k)
          setCityStatus('Map data unavailable — retrying…')
          timer.current = 3
        })
    }
  })

  return <primitive object={root} />
}

function lonLat(x: number, y: number): [number, number] {
  const p = tileToLonLat(x, y, TILE_Z)
  return [p.lon, p.lat]
}
