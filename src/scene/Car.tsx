import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { CarRig } from './buildCar'
import { applyPaint, modelUrl, useCarRig } from './carRig'
import { configureDrive, drive, stepDrive } from './drive'
import { CARS, type CarDef } from '../data/cars'
import { engine } from '../audio/engine'
import { useStore } from '../store'

interface Props {
  def: CarDef
  onRig?: (rig: CarRig) => void
  /** Receives the distance the car travelled this frame (for the follow camera). */
  onMove?: (delta: THREE.Vector3) => void
}

export function Car({ def, onRig, onMove }: Props) {
  const rig = useCarRig(def)
  const body = useRef<THREE.Group>(null)
  const lightLevel = useRef(0)
  const spots = useRef<THREE.SpotLight[]>([])
  const delta = useMemo(() => new THREE.Vector3(), [])
  // driver's eye from the model's bounds (left-hand drive): high in the cabin, a little behind mid-car.
  // Measured during render, before the model is mounted under the moving body (so in car space).
  const eye = useMemo(() => {
    const box = new THREE.Box3().setFromObject(rig.root)
    const size = box.getSize(new THREE.Vector3())
    const [nx, ny, nz] = def.cockpit ?? [0, 0, 0]
    const eye = new THREE.Vector3(box.min.x + size.x * 0.69 + nx, box.min.y + size.y * 0.8 + ny, box.max.z - size.z * 0.45 + nz)
    // sit square behind the steering wheel when the model has one as its own part
    const wheel = rig.root.getObjectByName('part:steering')
    if (wheel) eye.x = new THREE.Box3().setFromObject(wheel).getCenter(new THREE.Vector3()).x
    return eye
  }, [rig, def])
  const spotTargets = useMemo(
    () =>
      rig.headlightPositions.map((p) => {
        const o = new THREE.Object3D()
        // aim the beams down at the road a few metres ahead
        o.position.set(p.x * 1.3, -p.y, p.z + 3.2)
        return o
      }),
    [rig],
  )

  const paint = useStore((s) => s.paint)
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    onRig?.(rig)
    configureDrive({ topSpeedKmh: def.drive.topSpeed, accel: def.drive.accel, ...rig.dims })
    drive.eye.copy(eye)
    engine.configure(def.engine)
    if (import.meta.env.DEV) Object.assign(window, { __rig: rig, __drive: drive, __gl: gl })
    if (!useStore.getState().loaded) {
      useStore.getState().setLoaded()
      // warm the cache for the other cars (dropdown + showroom) once the first one is on screen
      for (const c of CARS) if (c !== def) useGLTF.preload(modelUrl(c), false, true)
    }
  }, [rig, def, onRig, gl, eye])

  useEffect(() => applyPaint(rig, paint), [paint, rig])

  // negative priority: move the car before the camera/floor follow it this frame
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const { dark } = useStore.getState()

    stepDrive(dt, delta)
    const { keys } = drive
    engine.update(dt, drive.speed, keys.up || (keys.down && drive.speed <= 0.5) ? 1 : 0)
    if (body.current) {
      body.current.position.copy(drive.position)
      body.current.rotation.y = drive.heading
    }
    if (delta.lengthSq() > 0) onMove?.(delta)

    for (const w of rig.wheels) {
      w.hinge.rotation.x = drive.wheelSpin
      w.hinge.rotation.y = w.front ? drive.steer : 0
    }

    // lights on in dark mode
    lightLevel.current = THREE.MathUtils.damp(lightLevel.current, dark ? 1 : 0, 4, dt)
    const l = lightLevel.current
    for (const m of rig.headlightMaterials) m.emissiveIntensity = l * 8
    for (const m of rig.taillightMaterials) m.emissiveIntensity = l * 4
    for (const s of spots.current) if (s) s.intensity = l * 140
  }, -1)

  return (
    <group ref={body}>
      <primitive object={rig.root} />
      <group position-y={rig.lift}>
        {rig.headlightPositions.map((p, i) => (
          <spotLight
            key={i}
            ref={(el) => {
              if (el) spots.current[i] = el
            }}
            position={p}
            angle={0.62}
            penumbra={1}
            distance={16}
            decay={1.4}
            intensity={0}
            color="#fff1d6"
            target={spotTargets[i]}
          />
        ))}
        {spotTargets.map((t, i) => (
          <primitive key={i} object={t} />
        ))}
      </group>
    </group>
  )
}

useGLTF.preload(modelUrl(CARS.find((c) => c.id === useStore.getState().carId) ?? CARS[0]), false, true)
