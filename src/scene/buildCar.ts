import * as THREE from 'three'
import { MESH_TO_PART, type PartId } from '../data/parts'

export interface PartRig {
  id: PartId
  /** Positioned at the part's centre (wheel parts: the axle). 930 only. */
  pivot?: THREE.Group
  /** Spin/steer joint for wheels; identity for everything else. 930 only. */
  hinge?: THREE.Group
  meshes: THREE.Mesh[]
}

export interface WheelRig {
  hinge: THREE.Group
  front: boolean
}

export interface CarRig {
  root: THREE.Group
  parts: Map<PartId, PartRig>
  paintMaterials: THREE.MeshPhysicalMaterial[]
  originalPaint: THREE.Color
  headlightMaterials: THREE.MeshStandardMaterial[]
  taillightMaterials: THREE.MeshStandardMaterial[]
  headlightPositions: THREE.Vector3[]
  wheels: WheelRig[]
  lift: number
  /** Paint finish to restore for the "Original" swatch. */
  originalMetal: { metalness: number; roughness: number }
  /** Driving geometry (metres). */
  dims: { wheelbase: number; wheelRadius: number; halfLength: number; halfWidth: number }
}

const WHEELS: Partial<Record<PartId, boolean>> = { wheelFL: true, wheelFR: true, wheelRL: false, wheelRR: false }

// GLTFLoader sanitises node names (drops '.'), so compare without dots
const clean = (name: string) => name.replace(/\./g, '')
const PART_BY_NAME = new Map(Object.entries(MESH_TO_PART).map(([k, v]) => [clean(k), v]))
const INTERIOR_ROOTS = new Set(['interior', 'Object_98.001', 'Cube_27_65.001', 'Cube.004_23_54.001', 'Cube_27_65'].map(clean))

function partFor(mesh: THREE.Object3D): PartId {
  const direct = PART_BY_NAME.get(clean(mesh.name))
  if (direct) return direct
  let o: THREE.Object3D | null = mesh
  while (o) {
    if (INTERIOR_ROOTS.has(clean(o.name))) return 'interior'
    o = o.parent
  }
  return 'body'
}

/** Lamp meshes that light up at night. Object_203 holds the round headlamp reflectors + fog lamps. */
const EMISSIVE: Record<string, 'head' | 'tail'> = {
  Object_203: 'head',
  Object_206001: 'tail',
}

export function buildCar(source: THREE.Object3D): CarRig {
  const scene = source.clone(true)
  scene.updateMatrixWorld(true)

  const meshes: THREE.Mesh[] = []
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })

  const groups = new Map<PartId, THREE.Mesh[]>()
  const add = (id: PartId, m: THREE.Mesh) => {
    m.userData.partId = id
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id)!.push(m)
  }

  for (const mesh of meshes) add(partFor(mesh), mesh)

  const root = new THREE.Group()
  root.name = 'porsche930'

  // lift so the tyre contact patches sit exactly on y = 0 (measured from tyre vertices, not loose bounds)
  let lowest = Infinity
  const v = new THREE.Vector3()
  for (const m of meshes) {
    if ((m.material as THREE.Material).name !== '930_tire') continue
    const pos = m.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) lowest = Math.min(lowest, v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).y)
  }
  const lift = Number.isFinite(lowest) ? -lowest : 0

  const parts = new Map<PartId, PartRig>()
  const paint = new Set<THREE.MeshPhysicalMaterial>()
  const headlightMaterials: THREE.MeshStandardMaterial[] = []
  const taillightMaterials: THREE.MeshStandardMaterial[] = []
  const lightClones = new Map<'head' | 'tail', THREE.MeshStandardMaterial>()
  const paintClones = new Map<THREE.Material, THREE.Material>()

  for (const [id, list] of groups) {
    const box = new THREE.Box3()
    for (const m of list) box.expandByObject(m)
    const center = box.getCenter(new THREE.Vector3())
    // wheels pivot on the tyre's centre = the axle
    const tyre = list.find((m) => (m.material as THREE.Material).name === '930_tire')
    if (id in WHEELS && tyre) new THREE.Box3().setFromObject(tyre).getCenter(center)

    const pivot = new THREE.Group()
    pivot.name = `part:${id}`
    pivot.position.copy(center)
    const hinge = new THREE.Group()
    hinge.rotation.order = 'YXZ' // wheels: steer about Y, then spin about the axle
    const inner = new THREE.Group()
    inner.position.copy(center).negate()
    pivot.add(hinge)
    hinge.add(inner)
    root.add(pivot)
    root.updateMatrixWorld(true)

    for (const m of list) {
      inner.attach(m)
      m.castShadow = true
      m.receiveShadow = true
      const mat = m.material as THREE.MeshStandardMaterial
      if (mat.name === 'paint') {
        // own copy per instance: the GLTF cache shares materials (the showroom shows another 930)
        let own = paintClones.get(mat)
        if (!own) paintClones.set(mat, (own = mat.clone()))
        m.material = own
        paint.add(own as THREE.MeshPhysicalMaterial)
      }
      const glow = EMISSIVE[clean(m.name)]
      if (glow) {
        let clone = lightClones.get(glow)
        if (!clone) {
          clone = mat.clone()
          clone.emissive = new THREE.Color(glow === 'head' ? '#fff4e0' : '#ff1408')
          clone.emissiveMap = null
          clone.emissiveIntensity = 0
          lightClones.set(glow, clone)
          ;(glow === 'head' ? headlightMaterials : taillightMaterials).push(clone)
        }
        m.material = clone
      }
    }

    parts.set(id, {
      id,
      pivot,
      hinge,
      meshes: list,
    })
  }

  root.position.y = lift

  const paintMaterials = [...paint]

  return {
    root,
    parts,
    paintMaterials,
    originalPaint: paintMaterials[0]?.color.clone() ?? new THREE.Color('#9e8508'),
    originalMetal: { metalness: paintMaterials[0]?.metalness ?? 0.41, roughness: paintMaterials[0]?.roughness ?? 0.3 },
    // axle centres at z 1.50 / -1.09, tyre radius 0.48
    dims: { wheelbase: 2.59, wheelRadius: 0.48, halfLength: 2.38, halfWidth: 1.05 },
    headlightMaterials,
    taillightMaterials,
    // round headlamps sit at x ±0.72, y 0.72, z 2.2 (car space)
    headlightPositions: [new THREE.Vector3(0.72, 0.72, 2.3), new THREE.Vector3(-0.72, 0.72, 2.3)],
    wheels: [...parts.values()].filter((p) => p.id in WHEELS).map((p) => ({ hinge: p.hinge!, front: !!WHEELS[p.id] })),
    lift,
  }
}
