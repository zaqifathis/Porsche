import * as THREE from 'three'
import type { CarDef } from '../data/cars'
import type { CarRig, WheelRig } from './buildCar'

type Rig = NonNullable<CarDef['rig']>

const GLASS = /glass|window|vidrio|windscreen/i

/** Transmission glass renders almost invisible here: swap it for tinted, reflective see-through glass. */
function asGlass(src: THREE.Material): THREE.Material {
  const tinted = (src as THREE.MeshStandardMaterial).color?.getHSL({ h: 0, s: 0, l: 0 }).l ?? 0
  return new THREE.MeshPhysicalMaterial({
    name: src.name,
    color: tinted > 0.6 ? '#3a4048' : '#14181d',
    metalness: 0,
    roughness: 0.04,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.6,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  })
}

const FRONT_YAW: Record<Rig['front'], number> = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 }

/** Geometry sharing `geo`'s attributes but drawing only the given triangles (bounds from those only). */
function subset(geo: THREE.BufferGeometry, idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  for (const name of Object.keys(geo.attributes)) g.setAttribute(name, geo.attributes[name])
  g.setIndex(idx)
  const pos = geo.getAttribute('position')
  const v = new THREE.Vector3()
  const box = new THREE.Box3()
  for (const i of idx) box.expandByPoint(v.fromBufferAttribute(pos, i))
  g.boundingBox = box
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere())
  return g
}

/** Visit each triangle of a mesh with its vertex indices and centroid in `space` (a matrix to car space). */
function forEachTriangle(mesh: THREE.Mesh, toCar: THREE.Matrix4, fn: (i0: number, i1: number, i2: number, c: THREE.Vector3) => void) {
  const geo = mesh.geometry
  const pos = geo.getAttribute('position')
  const index = geo.index
  const n = index ? index.count : pos.count
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  for (let k = 0; k < n; k += 3) {
    const i0 = index ? index.getX(k) : k
    const i1 = index ? index.getX(k + 1) : k + 1
    const i2 = index ? index.getX(k + 2) : k + 2
    a.fromBufferAttribute(pos, i0)
    b.fromBufferAttribute(pos, i1)
    c.fromBufferAttribute(pos, i2)
    a.add(b).add(c).multiplyScalar(1 / 3).applyMatrix4(toCar)
    fn(i0, i1, i2, a)
  }
}

/** Replace a mesh by sub-meshes (same material unless given), kept in place under `parent`. */
function addPiece(source: THREE.Mesh, idx: number[], material: THREE.Material | THREE.Material[], parent: THREE.Object3D) {
  const m = new THREE.Mesh(subset(source.geometry, idx), material)
  m.name = source.name
  source.matrixWorld.decompose(m.position, m.quaternion, m.scale)
  m.castShadow = true
  m.receiveShadow = true
  parent.attach(m)
  return m
}

/**
 * Rig a downloaded car model: face it down +z, scale it to its real length, put the tyres on y = 0,
 * give it its own paint/lamp materials, split lamps into white front / red rear, and cut the
 * wheel geometry into four spinning (front: steering) wheels — even when the model stores all
 * four wheels in a single mesh.
 */
export function buildGenericCar(source: THREE.Object3D, def: CarDef): CarRig {
  const cfg = def.rig!
  const root = new THREE.Group()
  root.name = def.id

  // 1. orient, scale and ground ------------------------------------------------------------------
  const norm = new THREE.Group()
  norm.rotation.y = FRONT_YAW[cfg.front]
  const model = source.clone(true)
  norm.add(model)
  root.add(norm)
  root.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(norm)
  const scale = cfg.length / (box.max.z - box.min.z)
  norm.scale.setScalar(scale)
  root.updateMatrixWorld(true)
  box.setFromObject(norm)
  norm.position.x -= (box.min.x + box.max.x) / 2
  norm.position.z -= (box.min.z + box.max.z) / 2
  root.updateMatrixWorld(true)

  const meshes: THREE.Mesh[] = []
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })
  const matName = (m: THREE.Mesh) => (Array.isArray(m.material) ? '' : m.material.name)
  const tyres = meshes.filter((m) => cfg.tyres.test(matName(m)))

  // ground = lowest tyre vertex
  let lowest = Infinity
  const v = new THREE.Vector3()
  for (const m of tyres) {
    const pos = m.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) lowest = Math.min(lowest, v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).y)
  }
  if (Number.isFinite(lowest)) norm.position.y -= lowest
  root.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(norm).getSize(new THREE.Vector3())

  // 2. per-instance materials (the GLTF cache shares materials between every use of a model) ------
  const clones = new Map<THREE.Material, THREE.Material>()
  const own = (mat: THREE.Material) => {
    let c = clones.get(mat)
    if (!c) clones.set(mat, (c = mat.clone()))
    return c
  }
  const paintMaterials: THREE.MeshPhysicalMaterial[] = []
  const glassClones = new Map<THREE.Material, THREE.Material>()
  for (const m of meshes) {
    if (Array.isArray(m.material)) continue
    m.castShadow = true
    m.receiveShadow = true
    if (cfg.paint.test(m.material.name)) {
      m.material = own(m.material)
      if (!paintMaterials.includes(m.material as THREE.MeshPhysicalMaterial)) paintMaterials.push(m.material as THREE.MeshPhysicalMaterial)
      continue
    }
    const transmissive = ((m.material as THREE.MeshPhysicalMaterial).transmission ?? 0) > 0
    const isLamp = cfg.lamps.test(m.material.name) || cfg.tail?.test(m.material.name)
    if (!isLamp && (transmissive || GLASS.test(m.material.name))) {
      let g = glassClones.get(m.material)
      if (!g) glassClones.set(m.material, (g = asGlass(m.material)))
      m.material = g
      m.castShadow = false
    }
  }

  // 3. lamps: front half white, rear half red ------------------------------------------------------
  const lamp = (base: THREE.Material, color: string) => {
    const c = base.clone() as THREE.MeshStandardMaterial
    c.emissive = new THREE.Color(color)
    c.emissiveMap = null
    c.emissiveIntensity = 0
    return c
  }
  const headlightMaterials: THREE.MeshStandardMaterial[] = []
  const taillightMaterials: THREE.MeshStandardMaterial[] = []
  const headBox = new THREE.Box3()
  for (const m of [...meshes]) {
    if (Array.isArray(m.material)) continue
    const name = m.material.name
    if (cfg.tail?.test(name)) {
      const red = lamp(m.material, '#ff1408')
      taillightMaterials.push(red)
      m.material = red
      continue
    }
    if (!cfg.lamps.test(name)) continue
    const front: number[] = []
    const rear: number[] = []
    forEachTriangle(m, m.matrixWorld, (i0, i1, i2, c) => {
      ;(c.z >= 0 ? front : rear).push(i0, i1, i2)
      if (c.z >= 0) headBox.expandByPoint(c)
    })
    const head = lamp(m.material, '#fff4e0')
    const tail = lamp(m.material, '#ff1408')
    headlightMaterials.push(head)
    taillightMaterials.push(tail)
    const parent = m.parent!
    if (front.length) addPiece(m, front, head, parent)
    if (rear.length) addPiece(m, rear, tail, parent)
    parent.remove(m)
    meshes.splice(meshes.indexOf(m), 1)
  }

  // 4. wheels: find the four tyre centres, then cut every rotating part around them ---------------
  type Corner = { box: THREE.Box3; center: THREE.Vector3; radius: number; front: boolean }
  const corners = new Map<string, Corner>()
  const cornerKey = (c: THREE.Vector3) => `${c.x >= 0 ? 'L' : 'R'}${c.z >= 0 ? 'F' : 'B'}`
  for (const m of tyres) {
    forEachTriangle(m, m.matrixWorld, (_a, _b, _c, c) => {
      const k = cornerKey(c)
      if (!corners.has(k)) corners.set(k, { box: new THREE.Box3(), center: new THREE.Vector3(), radius: 0, front: c.z >= 0 })
      corners.get(k)!.box.expandByPoint(c)
    })
  }
  for (const c of corners.values()) {
    c.box.getCenter(c.center)
    // centroids sit slightly inside the tread: pad the radius a little
    c.radius = (c.box.max.y - c.box.min.y) / 2 + 0.04
    c.center.y = Math.max(c.center.y, c.radius - 0.04)
  }

  const hinges = new Map<string, THREE.Group>()
  for (const [k, c] of corners) {
    const pivot = new THREE.Group()
    pivot.position.copy(c.center)
    const hinge = new THREE.Group()
    hinge.rotation.order = 'YXZ' // steer about Y, then spin about the axle
    pivot.add(hinge)
    root.add(pivot)
    hinges.set(k, hinge)
  }
  root.updateMatrixWorld(true)

  for (const m of meshes.filter((x) => !Array.isArray(x.material) && cfg.wheels.test(x.material.name))) {
    const parts = new Map<string, number[]>()
    const rest: number[] = []
    forEachTriangle(m, m.matrixWorld, (i0, i1, i2, c) => {
      const k = cornerKey(c)
      const corner = corners.get(k)
      const inside =
        corner &&
        Math.hypot(c.y - corner.center.y, c.z - corner.center.z) <= corner.radius * 1.06 &&
        Math.abs(c.x - corner.center.x) <= (corner.box.max.x - corner.box.min.x) / 2 + 0.12
      if (inside) {
        if (!parts.has(k)) parts.set(k, [])
        parts.get(k)!.push(i0, i1, i2)
      } else rest.push(i0, i1, i2)
    })
    for (const [k, idx] of parts) addPiece(m, idx, m.material, hinges.get(k)!)
    if (rest.length) m.geometry = subset(m.geometry, rest)
    else m.removeFromParent()
  }

  const wheels: WheelRig[] = [...corners.entries()].map(([k, c]) => ({ hinge: hinges.get(k)!, front: c.front }))
  const fronts = [...corners.values()].filter((c) => c.front)
  const rears = [...corners.values()].filter((c) => !c.front)
  const avgZ = (cs: Corner[], d: number) => (cs.length ? cs.reduce((s, c) => s + c.center.z, 0) / cs.length : d)
  const radius = corners.size ? [...corners.values()].reduce((s, c) => s + c.radius, 0) / corners.size : 0.33

  // headlamp beams start at the front lamps
  const hy = headBox.isEmpty() ? 0.65 : (headBox.min.y + headBox.max.y) / 2
  const hx = headBox.isEmpty() ? 0.6 : Math.max(0.4, headBox.max.x * 0.75)
  const hz = headBox.isEmpty() ? size.z / 2 : headBox.max.z

  const paint0 = paintMaterials[0]
  return {
    root,
    parts: new Map(),
    paintMaterials,
    originalPaint: paint0 ? paint0.color.clone() : new THREE.Color('#888888'),
    originalMetal: paint0 ? { metalness: paint0.metalness, roughness: paint0.roughness } : { metalness: 0.5, roughness: 0.3 },
    headlightMaterials,
    taillightMaterials,
    headlightPositions: [new THREE.Vector3(hx, hy, hz), new THREE.Vector3(-hx, hy, hz)],
    wheels,
    lift: 0,
    dims: {
      wheelbase: Math.max(1.8, avgZ(fronts, 1.3) - avgZ(rears, -1.3)),
      wheelRadius: radius,
      halfLength: size.z / 2,
      halfWidth: (cfg.width ?? size.x) / 2,
    },
  }
}
