import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CARS, type CarDef } from '../data/cars'
import { useStore } from '../store'
import { applyPaint, useCarRig } from './carRig'

/** Cars stand on a wide arc; the carousel turns so the selected one is front and centre. */
const RADIUS = 14
const STEP = 0.42 // radians between neighbours (~24°): the neighbours peek in at the sides

function ShowroomCar({ def, angle }: { def: CarDef; angle: number }) {
  const rig = useCarRig(def)
  useEffect(() => applyPaint(rig, { color: '', metallic: 0, roughness: 0 }), [rig])
  return (
    <group position={[Math.sin(angle) * RADIUS, 0, Math.cos(angle) * RADIUS]} rotation-y={angle}>
      <primitive object={rig.root} position-y={rig.lift} />
    </group>
  )
}

/** All cars, oldest to newest, on a turntable arc. ← / → (in the overlay) rotate it. */
export function Showroom() {
  const index = useStore((s) => s.showroomIndex)
  const ring = useRef<THREE.Group>(null)
  const angle = useRef(-index * STEP)
  const cars = useMemo(() => CARS.map((def, i) => ({ def, angle: i * STEP })), [])

  useFrame((_, dt) => {
    const goal = -index * STEP
    angle.current = THREE.MathUtils.damp(angle.current, goal, 4, Math.min(dt, 0.05))
    if (ring.current) ring.current.rotation.y = angle.current
  })

  return (
    // the ring's centre sits behind the stage, so the selected car lands at the origin
    <group position={[0, 0, -RADIUS]}>
      <group ref={ring}>
        {cars.map(({ def, angle: a }) => (
          <Suspense key={def.id} fallback={null}>
            <ShowroomCar def={def} angle={a} />
          </Suspense>
        ))}
      </group>
    </group>
  )
}
