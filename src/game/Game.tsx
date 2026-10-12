import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { drive } from '../scene/drive'
import { engine } from '../audio/engine'
import { useStore } from '../store'
import { DRIVABLE_START } from '../city/vectorSource'
import { GEMS_PER_CITY, GEM_RADIUS, PORTAL_RADIUS, game, resetGame } from './state'
import { findRoute, roadGraph } from './route'

const GEM_COLOR = new THREE.Color('#38e8ff')
const PORTAL_COLOR = new THREE.Color('#b26bff')
/** A target this far behind (e.g. unreachable across a river) is re-rolled somewhere closer. */
const GIVE_UP = 1200
/** Diamonds and the portal go on main roads; smaller streets only if none are loaded nearby. */
const MAIN_ROADS = new Set(['trunk', 'primary', 'secondary'])
/** Route line: floats this high over the road; rebuilt at most this often (s). */
const ROUTE_LIFT = 0.7
const ROUTE_EVERY = 0.4

/** Chevron pointing +z, lying flat, for the guide arrow that hovers over the car. */
function arrowGeometry() {
  const s = new THREE.Shape()
  s.moveTo(0, 1.1)
  s.lineTo(0.9, -0.2)
  s.lineTo(0.45, -0.2)
  s.lineTo(0.45, -0.9)
  s.lineTo(-0.45, -0.9)
  s.lineTo(-0.45, -0.2)
  s.lineTo(-0.9, -0.2)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false })
  g.translate(0, 0, -0.09)
  g.rotateX(Math.PI / 2) // shape +y → world +z
  return g
}

/** Glowing tube with dashes flowing toward the target (uv.x runs along the route). */
const routeVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const routeFrag = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform vec3 uColor;
  uniform vec3 uCar;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float d = vUv.x * uLength;
    float dash = smoothstep(0.35, 0.5, fract(d / 6.0 - uTime * 1.6)) * 0.6 + 0.4;
    // fade out at the target, and around the car (the line is re-planned a few times a second,
    // so its start trails the car a little; this also keeps it from crowding the camera)
    float ends = smoothstep(0.0, 8.0, uLength - d) * smoothstep(5.0, 14.0, distance(vWorld.xz, uCar.xz));
    gl_FragColor = vec4(uColor * 1.4 * dash, 0.8 * ends);
  }
`

const swirlVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const swirlFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float spiral = sin(a * 5.0 + r * 14.0 - uTime * 5.0) * 0.5 + 0.5;
    float core = smoothstep(0.55, 0.0, r);
    vec3 col = mix(uColor, vec3(1.0), core * 0.85) * (0.55 + spiral * 0.9);
    float alpha = smoothstep(1.0, 0.82, r) * (0.55 + 0.45 * spiral);
    gl_FragColor = vec4(col * 1.6, alpha);
  }
`

/**
 * City treasure hunt: one diamond at a time on a main road, guided by a floating arrow or a route
 * line along the streets, and after GEMS_PER_CITY a time-travel portal that warps to a random city.
 */
export function Game() {
  const city = useStore((s) => s.city)
  const routeRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>>(null)
  const routeIn = useRef(0)
  const routeFrom = useRef({ x: Infinity, z: Infinity, target: null as THREE.Vector3 | null, version: -1 })
  const gemRef = useRef<THREE.Group>(null)
  const portalRef = useRef<THREE.Group>(null)
  const beamRef = useRef<THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>>(null)
  const arrowRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>(null)
  const popRef = useRef<THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>(null)
  const spawnIn = useRef(0)
  const pop = useRef(-1)
  const cam = useMemo(() => new THREE.Vector3(), [])

  const arrowGeo = useMemo(() => arrowGeometry(), [])
  const routeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: routeVert,
        fragmentShader: routeFrag,
        uniforms: { uTime: { value: 0 }, uLength: { value: 1 }, uColor: { value: GEM_COLOR.clone() }, uCar: { value: new THREE.Vector3() } },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )
  const swirl = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: swirlVert,
        fragmentShader: swirlFrag,
        uniforms: { uTime: { value: 0 }, uColor: { value: PORTAL_COLOR.clone() } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  )
  useEffect(
    () => () => {
      arrowGeo.dispose()
      swirl.dispose()
      routeMat.dispose()
      routeRef.current?.geometry.dispose()
    },
    [arrowGeo, swirl, routeMat],
  )

  // a new city (or leaving one) starts the hunt over
  useEffect(() => {
    resetGame()
    spawnIn.current = 0.5
    return resetGame
  }, [city])

  useFrame((state, dt) => {
    const st = useStore.getState()
    const gem = gemRef.current, portal = portalRef.current, beam = beamRef.current, arrow = arrowRef.current
    if (!gem || !portal || !beam || !arrow) return
    const t = state.clock.elapsedTime
    const portalOpen = st.gems >= GEMS_PER_CITY
    const car = drive.position

    // pick-up burst: an expanding ring where the diamond was
    const ring = popRef.current
    if (ring) {
      ring.visible = pop.current >= 0
      if (pop.current >= 0) {
        pop.current += dt
        const k = pop.current / 0.6
        ring.scale.setScalar(1 + k * 6)
        ring.material.opacity = Math.max(0, 1 - k)
        if (k >= 1) pop.current = -1
      }
    }

    if (!game.target && !drive.locked && !st.warping) {
      spawnIn.current -= dt
      if (spawnIn.current <= 0) {
        spawnIn.current = 0.5
        const [min, max] = portalOpen ? [120, 300] : [300, 650]
        const sample = game.sampleRoad
        const p =
          sample &&
          (sample(car.x, car.z, min, max, MAIN_ROADS) ??
            sample(car.x, car.z, min, max, DRIVABLE_START) ??
            sample(car.x, car.z, min / 2, max * 1.4, MAIN_ROADS) ??
            sample(car.x, car.z, 60, max * 1.4, DRIVABLE_START))
        if (p) {
          game.target = new THREE.Vector3(p.x, car.y, p.z)
          game.targetHeading = p.heading
        }
      }
    }

    const target = game.target
    gem.visible = !!target && !portalOpen
    portal.visible = !!target && portalOpen
    beam.visible = !!target
    arrow.visible = false
    const route = routeRef.current
    if (route) route.visible = false
    if (!target) return

    // targets ride at the car's height (the photoreal ground isn't flat, the road under the car is)
    target.y = THREE.MathUtils.damp(target.y, car.y, 1.5, dt)
    const dx = target.x - car.x, dz = target.z - car.z
    const dist = Math.hypot(dx, dz)

    if (dist > GIVE_UP) {
      game.target = null
      return
    }
    if (!drive.locked && !st.warping) {
      if (!portalOpen && dist < GEM_RADIUS) {
        engine.cue('gem')
        pop.current = 0
        ring?.position.set(target.x, target.y + 0.15, target.z)
        game.target = null
        spawnIn.current = 0.4
        st.collectGem()
        return
      }
      if (portalOpen && dist < PORTAL_RADIUS) {
        engine.cue('portal')
        st.warp()
      }
    }

    // diamond: spin + bob
    gem.position.set(target.x, target.y + 4.2 + Math.sin(t * 2.2) * 0.4, target.z)
    gem.rotation.y = t * 1.8

    // portal: stands across the road; the swirl turns
    portal.position.set(target.x, target.y, target.z)
    portal.rotation.y = game.targetHeading
    swirl.uniforms.uTime.value = t

    // light beam marks the target from afar and fades out as you arrive
    const color = portalOpen ? PORTAL_COLOR : GEM_COLOR
    beam.position.set(target.x, target.y + 60 + (portalOpen ? 9.5 : 0), target.z)
    beam.material.color.copy(color)
    beam.material.opacity = 0.13 * THREE.MathUtils.smoothstep(dist, 12, 50)

    const showGuide = dist > 12 && !st.warping
    if (route && st.guide === 'route') {
      // route line along the roads, re-planned as the car moves
      routeMat.uniforms.uTime.value = t
      routeMat.uniforms.uColor.value.copy(color)
      routeMat.uniforms.uCar.value.copy(car)
      routeIn.current -= dt
      const last = routeFrom.current
      const moved = Math.hypot(car.x - last.x, car.z - last.z)
      if (routeIn.current <= 0 && (moved > 4 || last.target !== target || last.version !== game.roadsVersion)) {
        routeIn.current = ROUTE_EVERY
        routeFrom.current = { x: car.x, z: car.z, target, version: game.roadsVersion }
        const geo = buildRoute(car, target)
        route.geometry.dispose()
        route.geometry = geo.geometry
        routeMat.uniforms.uLength.value = geo.length
      }
      route.visible = showGuide
      return
    }

    // guide arrow floating above and ahead of the car, pointing at the target
    arrow.visible = showGuide
    const yaw = Math.atan2(dx, dz)
    arrow.position.set(
      car.x + Math.sin(drive.heading) * 2.5,
      car.y + 3.4 + Math.sin(t * 3) * 0.08,
      car.z + Math.cos(drive.heading) * 2.5,
    )
    // tip the chevron's face toward the camera (it sits near eye level), but keep it reading as a direction
    cam.subVectors(state.camera.position, arrow.position)
    // (either face will do: it's a flat slab, so flip when the camera is below it)
    const flip = cam.y < 0 ? -1 : 1
    const up = cam.y * flip, fwd = (cam.x * Math.sin(yaw) + cam.z * Math.cos(yaw)) * flip
    arrow.rotation.set(THREE.MathUtils.clamp(Math.atan2(fwd, up), -0.95, 0.95), yaw, 0, 'YXZ')
    arrow.material.color.copy(color)
    arrow.material.emissive.copy(color)
  })

  return (
    <>
      <group ref={gemRef} visible={false}>
        <mesh scale={[1, 1.45, 1]} castShadow>
          <octahedronGeometry args={[2.2, 0]} />
          <meshStandardMaterial color={GEM_COLOR} emissive={GEM_COLOR} emissiveIntensity={1.6} metalness={0.2} roughness={0.08} flatShading toneMapped={false} fog={false} />
        </mesh>
      </group>

      <group ref={portalRef} visible={false}>
        <group position-y={4.6}>
          <mesh>
            <torusGeometry args={[4.4, 0.32, 16, 64]} />
            <meshStandardMaterial color={PORTAL_COLOR} emissive={PORTAL_COLOR} emissiveIntensity={2.4} toneMapped={false} fog={false} />
          </mesh>
          <mesh material={swirl}>
            <circleGeometry args={[4.3, 64]} />
          </mesh>
        </group>
      </group>

      <mesh ref={beamRef} visible={false} renderOrder={2}>
        <cylinderGeometry args={[3.4, 3.4, 120, 32, 1, true]} />
        <meshBasicMaterial transparent opacity={0.13} depthWrite={false} toneMapped={false} fog={false} side={THREE.DoubleSide} />
      </mesh>

      <mesh ref={popRef} visible={false} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[2, 2.4, 48]} />
        <meshBasicMaterial color={GEM_COLOR} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      <mesh ref={routeRef} material={routeMat} visible={false} frustumCulled={false} renderOrder={3} />

      <mesh ref={arrowRef} geometry={arrowGeo} visible={false} scale={0.6}>
        <meshStandardMaterial color={GEM_COLOR} emissive={GEM_COLOR} emissiveIntensity={0.9} roughness={0.4} transparent opacity={0.92} toneMapped={false} />
      </mesh>
    </>
  )
}

/**
 * Tube floating above the road route from the car to the target (A* over the loaded roads), or a
 * simple arc over the rooftops when no road connection is known yet.
 */
function buildRoute(car: THREE.Vector3, target: THREE.Vector3): { geometry: THREE.BufferGeometry; length: number } {
  const roads = game.roads?.()
  const flat = roads?.length
    ? findRoute(roadGraph(roads, game.roadsVersion), car.x, car.z, target.x, target.z, Math.sin(drive.heading), Math.cos(drive.heading))
    : null
  const pts: THREE.Vector3[] = []
  if (flat) {
    // drop near-duplicate points (they make Catmull-Rom loop), then lift the line over the road
    let total = 0
    for (let i = 2; i < flat.length; i += 2) total += Math.hypot(flat[i] - flat[i - 2], flat[i + 1] - flat[i - 1])
    let run = 0
    for (let i = 0; i < flat.length; i += 2) {
      if (i) run += Math.hypot(flat[i] - flat[i - 2], flat[i + 1] - flat[i - 1])
      const p = new THREE.Vector3(flat[i], 0, flat[i + 1])
      const prev = pts[pts.length - 1]
      if (prev && i < flat.length - 2 && Math.hypot(p.x - prev.x, p.z - prev.z) < 4) continue
      const k = total ? run / total : 0
      p.y = THREE.MathUtils.lerp(car.y, target.y, k) + ROUTE_LIFT
      pts.push(p)
    }
  }
  if (pts.length < 2) {
    pts.length = 0
    const d = Math.hypot(target.x - car.x, target.z - car.z)
    for (let i = 0; i <= 24; i++) {
      const k = i / 24
      pts.push(
        new THREE.Vector3(
          THREE.MathUtils.lerp(car.x, target.x, k),
          THREE.MathUtils.lerp(car.y, target.y, k) + ROUTE_LIFT + Math.sin(k * Math.PI) * Math.min(60, d * 0.15),
          THREE.MathUtils.lerp(car.z, target.z, k),
        ),
      )
    }
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const length = curve.getLength()
  const segments = THREE.MathUtils.clamp(Math.round(length / 2), 16, 800)
  return { geometry: new THREE.TubeGeometry(curve, segments, 0.16, 8, false), length }
}
