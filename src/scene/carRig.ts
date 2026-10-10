import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { buildCar, type CarRig } from './buildCar'
import { buildGenericCar } from './buildGenericCar'
import type { CarDef } from '../data/cars'

export const modelUrl = (def: CarDef) => `${import.meta.env.BASE_URL}models/${def.file}`

/** Load a car model and rig it (the 930 has its own hand-tuned rig; the others are generic). */
export function useCarRig(def: CarDef): CarRig {
  const gltf = useGLTF(modelUrl(def), false, true)
  return useMemo(() => (def.rig ? buildGenericCar(gltf.scene, def) : buildCar(gltf.scene)), [gltf.scene, def])
}

/** Apply a paint (or the car's own finish for "Original") to a rig. */
export function applyPaint(rig: CarRig, paint: { color: string; metallic: number; roughness: number }) {
  const color = paint.color ? new THREE.Color(paint.color) : rig.originalPaint
  for (const m of rig.paintMaterials) {
    m.color.copy(color)
    m.metalness = paint.color ? paint.metallic : rig.originalMetal.metalness
    m.roughness = paint.color ? paint.roughness : rig.originalMetal.roughness
  }
}
