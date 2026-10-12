import { Suspense, useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bvh, CameraControls, Environment, Grid, Lightformer, MeshReflectorMaterial, Sky } from '@react-three/drei'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Car } from './Car'
import { useStore, type CamView } from '../store'
import { VIEW_CHASE, VIEW_FAR, VIEW_HOME, VIEW_SHOWROOM, VIEW_SHOWROOM_PORTRAIT, carView, fitView, type View } from './views'
import { drive, resetDrive } from './drive'
import { City } from '../city/City'
import { PhotorealCity } from '../city/PhotorealCity'
import { Showroom } from './Showroom'
import { Game } from '../game/Game'
import { carById } from '../data/cars'
import { LITE } from './device'

const THEME = {
  light: { bg: '#e9eaec', floor: '#d9dbde', env: 0.85, ambient: 0.2, fog: [25, 70] },
  dark: { bg: '#050608', floor: '#15171b', env: 0.14, ambient: 0.02, fog: [25, 70] },
}
const CITY_THEME = {
  light: { bg: '#dfe6ee', env: 0.6, ambient: 0.25, fog: [180, 1100] },
  dark: { bg: '#07080b', env: 0.1, ambient: 0.06, fog: [60, 650] },
}

function Studio() {
  return (
    <Environment resolution={512} frames={1}>
      <color attach="background" args={['#0d0d10']} />
      {/* long softbox overhead */}
      <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 3, 1]} />
      <Lightformer form="rect" intensity={1.5} position={[0, 6, -4]} rotation-x={Math.PI / 2} scale={[12, 1, 1]} />
      <Lightformer form="rect" intensity={1.5} position={[0, 6, 4]} rotation-x={Math.PI / 2} scale={[12, 1, 1]} />
      {/* side strips for long body reflections */}
      <Lightformer form="rect" intensity={2} position={[-8, 1.5, 0]} rotation-y={Math.PI / 2} scale={[16, 1.2, 1]} />
      <Lightformer form="rect" intensity={2} position={[8, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[16, 1.2, 1]} />
      {/* key + rim */}
      <Lightformer form="ring" color="#fff" intensity={6} position={[6, 4, 8]} scale={2.5} target={[0, 0, 0]} />
      <Lightformer form="circle" color="#cfe0ff" intensity={2} position={[-6, 3, -8]} scale={3} target={[0, 0, 0]} />
    </Environment>
  )
}

/** Real-time sun shadow (re-rendered every frame) on an invisible catcher that rides under the car. */
function ShadowCatcher({ dark, y }: { dark: boolean; y: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => ref.current?.position.set(drive.position.x, drive.position.y + y, drive.position.z))
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[16, 16]} />
      <shadowMaterial transparent opacity={dark ? 0.8 : 0.6} color="#1a1c20" />
    </mesh>
  )
}

/** Endless studio ground: the reflective floor rides along under the car, the grid stays fixed in world space. */
function StudioFloor({ dark }: { dark: boolean }) {
  const t = dark ? THEME.dark : THEME.light
  const floor = useRef<THREE.Mesh>(null)
  useFrame(() => {
    floor.current?.position.set(drive.position.x, 0, drive.position.z)
  })
  return (
    <>
      <mesh ref={floor} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[70, 64]} />
        <MeshReflectorMaterial
          color={t.floor}
          resolution={LITE ? 512 : 1024}
          blur={[400, 120]}
          mixBlur={1}
          mixStrength={dark ? 6 : 1.2}
          mixContrast={1}
          mirror={dark ? 0.7 : 0.35}
          roughness={dark ? 0.75 : 0.9}
          depthScale={0.6}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          metalness={dark ? 0.6 : 0.2}
        />
      </mesh>
      <Grid
        position-y={0.002}
        infiniteGrid
        followCamera
        cellSize={1}
        sectionSize={5}
        cellThickness={0.8}
        sectionThickness={1.4}
        cellColor={dark ? '#23272e' : '#9fa4ab'}
        sectionColor={dark ? '#363c46' : '#7c828a'}
        fadeDistance={60}
        fadeStrength={1.2}
      />
    </>
  )
}

/** Key light whose shadow map follows the car, so its shadow travels with it. */
function SunShadow({ dark, strength }: { dark: boolean; strength: number }) {
  const light = useRef<THREE.DirectionalLight>(null)
  useFrame(() => {
    const l = light.current
    if (!l) return
    const { x, y, z } = drive.position
    l.position.set(x + 3, y + 10, z + 2)
    l.target.position.set(x, y, z)
    l.target.updateMatrixWorld()
  })
  return (
    <directionalLight
      ref={light}
      intensity={dark ? 0.1 : strength}
      castShadow
      shadow-mapSize={LITE ? [1024, 1024] : [2048, 2048]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
    >
      <orthographicCamera attach="shadow-camera" args={[-4.5, 4.5, 4.5, -4.5, 1, 25]} />
    </directionalLight>
  )
}

/** Interior camera: wide lens, short near plane (the dashboard is close); the outside views keep the long lens. */
const FOV = { interior: 68, outside: 32 }
const NEAR = { interior: 0.08, outside: 0.25 }

/** Put an outside driving view (behind / far behind) around the car. */
function lookFromBehind(c: CameraControls, v: CamView, smooth: boolean) {
  const aspect = window.innerWidth / window.innerHeight
  c.setLookAt(...carView(fitView(v === 'far' ? VIEW_FAR : VIEW_CHASE, aspect), drive.position, drive.heading), smooth)
}

const eyeW = new THREE.Vector3()
const lookW = new THREE.Vector3()

function Rig({ controls }: { controls: React.RefObject<CameraControls | null> }) {
  const aspect = useThree((s) => s.size.width / s.size.height)
  const aspectRef = useRef(aspect)
  useEffect(() => {
    aspectRef.current = aspect
  }, [aspect])
  const first = useRef(true)
  const mode = useStore((s) => s.mode)
  const city = useStore((s) => s.city)
  const camView = useStore((s) => s.camView)

  const view = (v: View) => carView(fitView(v, aspectRef.current), drive.position, drive.heading)

  // switching world: start over at the origin; in a city the camera moves once the car is on a road
  useEffect(() => {
    if (first.current) return
    resetDrive()
    const showroom = aspectRef.current < 1 ? VIEW_SHOWROOM_PORTRAIT : VIEW_SHOWROOM
    if (mode !== 'city') controls.current?.setLookAt(...view(mode === 'showroom' ? showroom : VIEW_HOME), true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, city])

  useEffect(() => {
    const c = controls.current
    if (!c || !first.current) return
    first.current = false
    c.setLookAt(...view([9, 3.2, 10, 0, 0.6, 0]), false)
    c.setLookAt(...view(VIEW_HOME), true)
  })

  // switching driving camera in a city (the interior one is placed every frame below)
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const driving = mode === 'city'
    c.enabled = !(driving && camView === 'interior')
    if (driving && camView !== 'interior' && !drive.locked) lookFromBehind(c, camView, true)
  }, [camView, mode, controls])

  useFrame((state, dt) => {
    const c = controls.current
    if (!c) return
    const st = useStore.getState()
    const interior = st.mode === 'city' && st.camView === 'interior'

    const cam = state.camera as THREE.PerspectiveCamera
    const fovGoal = interior ? FOV.interior : FOV.outside
    const fov = Math.abs(cam.fov - fovGoal) < 0.05 ? fovGoal : THREE.MathUtils.damp(cam.fov, fovGoal, 6, dt)
    const near = interior ? NEAR.interior : NEAR.outside
    if (fov !== cam.fov || near !== cam.near) {
      cam.fov = fov
      cam.near = near
      cam.updateProjectionMatrix()
    }

    if (interior) {
      // driver's seat: eye fixed in the car, looking down the road and a little into the turn
      const h = drive.heading, cos = Math.cos(h), sin = Math.sin(h)
      const { x, y, z } = drive.eye
      eyeW.set(drive.position.x + x * cos + z * sin, drive.position.y + y, drive.position.z - x * sin + z * cos)
      const yaw = h + drive.steer * 0.35
      lookW.set(eyeW.x + Math.sin(yaw) * 10, eyeW.y - 0.7, eyeW.z + Math.cos(yaw) * 10)
      // keep the controls' own state in step (so leaving the cockpit glides out from here), but set the
      // camera directly too: the controls only apply it next frame, which would lag a moving car
      c.setLookAt(eyeW.x, eyeW.y, eyeW.z, lookW.x, lookW.y, lookW.z, false)
      cam.position.copy(eyeW)
      cam.lookAt(lookW)
      return
    }

    if (st.autoRotate) c.azimuthAngle += dt * 0.25
    // city chase cam: while driving (and not being dragged) swing round behind the car
    else if (st.mode === 'city' && Math.abs(drive.speed) > 1 && c.currentAction === 0) {
      const behind = drive.heading + Math.PI
      const delta = Math.atan2(Math.sin(behind - c.azimuthAngle), Math.cos(behind - c.azimuthAngle))
      c.azimuthAngle += delta * Math.min(1, dt * 2.2)
    }
  })
  return null
}

export function Scene({ controlsRef }: { controlsRef: React.RefObject<CameraControls | null> }) {
  const dark = useStore((s) => s.dark)
  // follow camera: shift the orbit target by however far the car moved
  const target = useRef(new THREE.Vector3())
  const onMove = useCallback(
    (d: THREE.Vector3) => {
      const c = controlsRef.current
      if (!c) return
      c.getTarget(target.current, true).add(d)
      c.moveTo(target.current.x, target.current.y, target.current.z, false)
    },
    [controlsRef],
  )
  const mode = useStore((s) => s.mode)
  const city = useStore((s) => s.city)
  const ionToken = useStore((s) => s.ionToken)
  const cityLook = useStore((s) => s.cityLook)
  const photorealError = useStore((s) => s.photorealError)
  const carDef = carById(useStore((s) => s.carId))
  const inCity = mode === 'city' && !!city
  const photoreal = inCity && cityLook === 'photoreal' && !!ionToken && !photorealError
  const base = inCity ? (dark ? CITY_THEME.dark : CITY_THEME.light) : dark ? THEME.dark : THEME.light
  // photoreal tiles stay sharp much further out than the OSM blocks
  const t = photoreal && !dark ? { ...base, fog: [400, 2600] } : base
  const onPlaced = useCallback(() => {
    const c = controlsRef.current
    const v = useStore.getState().camView
    if (c && v !== 'interior') lookFromBehind(c, v, true)
  }, [controlsRef])

  return (
    <Canvas
      shadows
      dpr={LITE ? [1, 1.5] : [1, 2]}
      camera={{ position: [9, 3.2, 10], fov: 32, near: 0.25, far: 4000 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[t.bg]} />
      <fog attach="fog" args={[t.bg, t.fog[0], t.fog[1]]} />
      <ambientLight intensity={t.ambient} />
      <SunShadow dark={dark} strength={inCity ? 3.2 : 2.6} />

      <Suspense fallback={null}>
        <Studio />
        <EnvIntensity value={t.env} />
        {mode === 'showroom' ? (
          <Showroom />
        ) : (
          <>
            {/* own boundary: switching cars keeps the rest of the scene on screen while it loads */}
            <Suspense fallback={null}>
              <Bvh firstHitOnly>
                <Car key={carDef.id} def={carDef} onMove={onMove} />
              </Bvh>
            </Suspense>
          </>
        )}
        {inCity ? (
          <>
            {!dark && <Sky distance={3000} sunPosition={[3, 10, 2]} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} />}
            {/* keyed per city: its ground offset is measured once per city */}
            {photoreal && <PhotorealCity key={`${city.lat},${city.lon}`} city={city} token={ionToken} />}
            <City key={photoreal ? 'data' : 'osm'} city={city} dark={dark} visual={!photoreal} onPlaced={onPlaced} />
            <Game />
          </>
        ) : (
          <StudioFloor dark={dark} />
        )}
        <ShadowCatcher dark={dark} y={photoreal ? 0.05 : inCity ? 0.07 : 0.003} />
      </Suspense>

      <CameraControls
        ref={controlsRef}
        makeDefault
        minDistance={2.6}
        maxDistance={inCity ? 45 : 24}
        maxPolarAngle={Math.PI / 2 - 0.04}
        smoothTime={0.6}
      />
      <Rig controls={controlsRef} />

      <EffectComposer multisampling={LITE ? 0 : 4}>
        <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={dark ? 1.4 : 0.25} />
        <ToneMapping mode={photoreal ? ToneMappingMode.NEUTRAL : ToneMappingMode.AGX} />
        <Vignette offset={0.3} darkness={dark ? 0.7 : 0.35} />
      </EffectComposer>
    </Canvas>
  )
}

/** Smoothly fades environment lighting between themes. */
function EnvIntensity({ value }: { value: number }) {
  useFrame(({ scene }, dt) => {
    const s = scene as THREE.Scene & { environmentIntensity: number }
    s.environmentIntensity = THREE.MathUtils.damp(s.environmentIntensity ?? 1, value, 3, dt)
  })
  return null
}
