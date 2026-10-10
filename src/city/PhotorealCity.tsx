import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { TilesAttributionOverlay, TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import {
  CesiumIonAuthPlugin,
  GLTFExtensionsPlugin,
  ReorientationPlugin,
  TileCompressionPlugin,
  UnloadTilesPlugin,
} from '3d-tiles-renderer/plugins'
import type { TilesRenderer as TilesRendererImpl } from '3d-tiles-renderer/three'
import { drive } from '../scene/drive'
import { useStore, type CityPick } from '../store'

/** Google Photorealistic 3D Tiles, as served through Cesium ion. */
const GOOGLE_PHOTOREAL_ASSET = '2275207'
const DEG = Math.PI / 180

interface Props {
  city: CityPick
  token: string
}

/**
 * Streams photoreal city tiles around the city's origin. The tiles are re-oriented so the chosen
 * point sits at the scene origin, shifted so the street is at y ≈ 0, and shown "as photographed"
 * (unlit textures — the lighting is already in the photos, so night mode isn't offered here).
 */
export function PhotorealCity({ city, token }: Props) {
  const tiles = useRef<TilesRendererImpl>(null)
  const lift = useRef<THREE.Group>(null)
  const settled = useRef(false)
  const setCityStatus = useStore((s) => s.setCityStatus)
  const setPhotorealError = useStore((s) => s.setPhotorealError)

  const draco = useMemo(() => {
    const d = new DRACOLoader()
    d.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
    return d
  }, [])
  useEffect(
    () => () => {
      draco.dispose()
    },
    [draco],
  )

  /** The photos already contain the lighting: show tiles unlit. */
  const prepare = (scene: THREE.Object3D) => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const orig = m.material as THREE.MeshStandardMaterial
      m.material = new THREE.MeshBasicMaterial({ map: orig.map, side: orig.side })
      orig.dispose() // the texture now belongs to the basic material
    })
  }

  /**
   * The photoreal city is a single surface "shell": straight down from high above the car the hits are
   * tree canopies, roofs, bridge decks and finally the ground.
   */
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const down = useMemo(() => new THREE.Vector3(0, -1, 0), [])
  const from = useMemo(() => new THREE.Vector3(), [])
  /** Heights of every surface straight below (x, aboveY, z), highest first. */
  const surfacesAt = (x: number, z: number, aboveY: number, range: number): number[] => {
    const t = tiles.current
    if (!t) return []
    from.set(x, aboveY, z)
    ray.set(from, down)
    ray.far = range
    return ray.intersectObject(t.group, true).map((h) => h.point.y)
  }
  const lowest = (ys: number[]) => (ys.length ? ys[ys.length - 1] : null)

  /**
   * Heights in the tiles are above the WGS84 ellipsoid, not the street. Once the car is on its road,
   * lift the tileset so that street sits near y = 0 (the car then follows the real surface).
   */
  const settle = () => {
    // wait until the car is on its road, so the ray lands on street rather than a rooftop
    if (settled.current || !lift.current || drive.locked) return
    const g = lowest(surfacesAt(drive.position.x, drive.position.z, 9000, 18000))
    if (g === null) return
    lift.current.position.y -= g - drive.position.y
    settled.current = true
    setCityStatus('')
  }

  const poll = useRef(0)
  useFrame((_, dt) => {
    if (settled.current) return
    poll.current -= dt
    if (poll.current > 0) return
    poll.current = 0.5
    settle()
  })

  // ground under the car, re-sampled ~10×/s (finer tiles keep arriving, so the surface can shift)
  useEffect(() => {
    let lastX = Infinity
    let lastZ = Infinity
    let lastT = 0
    let cached: number | null = null
    drive.ground = (x, z) => {
      if (!settled.current) return null
      const now = performance.now()
      if (now - lastT < 100 && Math.hypot(x - lastX, z - lastZ) < 1) return cached
      lastT = now
      lastX = x
      lastZ = z
      // Look from far above (early low-detail tiles can sit 100 m+ off the real surface), then stay on
      // the surface the car is driving on: the highest one at most a kerb-step above the wheels. That
      // keeps it on a bridge deck instead of dropping to the road or river below, and ignores trees
      // and overhangs above. Nothing that low means the car is under everything: take the lowest.
      const ys = surfacesAt(x, z, drive.position.y + 1500, 3000)
      const step = drive.position.y + 1.0
      cached = ys.find((y) => y <= step) ?? lowest(ys) ?? cached
      return cached
    }
    setCityStatus('Loading photoreal tiles…')
    return () => {
      drive.ground = null
      drive.position.y = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCityStatus])

  return (
    // after reorientation the tiles have X west and Z north; turn them to our +X east / +Z south frame
    <group rotation-y={Math.PI}>
      <group ref={lift}>
        <TilesRenderer
          key={`${token}:${city.lat},${city.lon}`}
          ref={tiles}
          onLoadModel={({ scene }) => prepare(scene)}
          onLoadError={({ tile, error }) => {
            // the tileset itself was refused (bad/expired token, no access): fall back to the blocks city
            if (tile === null || /\b40[13]\b/.test(String(error))) {
              setPhotorealError('Photoreal off: token refused')
            }
          }}
        >
          <TilesPlugin
            plugin={CesiumIonAuthPlugin}
            args={[{ apiToken: token, assetId: GOOGLE_PHOTOREAL_ASSET, autoRefreshToken: true }]}
          />
          <TilesPlugin plugin={GLTFExtensionsPlugin} args={[{ dracoLoader: draco }]} />
          <TilesPlugin plugin={ReorientationPlugin} args={[{ lat: city.lat * DEG, lon: city.lon * DEG, height: 0, recenter: true }]} />
          <TilesPlugin plugin={TileCompressionPlugin} />
          <TilesPlugin plugin={UnloadTilesPlugin} />
          <TilesAttributionOverlay className="tiles-credits" />
        </TilesRenderer>
      </group>
    </group>
  )
}
