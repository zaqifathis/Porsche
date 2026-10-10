import * as THREE from 'three'
import type { Building, RoadLine } from './vectorSource'

const signedArea = (r: number[]) => {
  let a = 0
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n
    a += r[i] * r[j + 1] - r[j] * r[i + 1]
  }
  return a / 2
}
const reversed = (r: number[]) => {
  const out: number[] = []
  for (let i = r.length - 2; i >= 0; i -= 2) out.push(r[i], r[i + 1])
  return out
}

/** Extruded footprints (walls + flat roofs) merged into one geometry with per-building vertex colours. */
export function buildBuildings(list: Building[], palette: THREE.Color[]): THREE.BufferGeometry | null {
  const pos: number[] = []
  const nor: number[] = []
  const col: number[] = []
  const c = new THREE.Color()

  for (const b of list) {
    c.copy(palette[Math.floor(b.shade * palette.length) % palette.length])
    const y0 = b.minHeight
    const y1 = b.height
    // outer ring counter-clockwise, holes clockwise → wall normal (dz, -dx) always faces out of the solid
    const rings = b.rings.map((r, i) => ((signedArea(r) > 0) === (i === 0) ? r : reversed(r)))

    for (const r of rings) {
      for (let i = 0, n = r.length; i < n; i += 2) {
        const j = (i + 2) % n
        const ax = r[i], az = r[i + 1], bx = r[j], bz = r[j + 1]
        let nx = bz - az
        let nz = -(bx - ax)
        const len = Math.hypot(nx, nz) || 1
        nx /= len
        nz /= len
        // (a, c, b) and (a, d, c): counter-clockwise seen from outside
        pos.push(ax, y0, az, bx, y1, bz, bx, y0, bz, ax, y0, az, ax, y1, az, bx, y1, bz)
        for (let k = 0; k < 6; k++) {
          nor.push(nx, 0, nz)
          col.push(c.r, c.g, c.b)
        }
      }
    }

    // roof
    const contour = toV2(rings[0])
    const holes = rings.slice(1).map(toV2)
    const all = contour.concat(...holes)
    const roof = c.clone().multiplyScalar(0.92)
    for (const [i0, i1, i2] of THREE.ShapeUtils.triangulateShape(contour, holes)) {
      const p0 = all[i0], p1 = all[i1], p2 = all[i2]
      // keep the face pointing up (+y): (p1-p0) × (p2-p0) must have positive y
      const up = (p1.y - p0.y) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.y - p0.y) > 0
      const tri = up ? [p0, p1, p2] : [p0, p2, p1]
      for (const p of tri) {
        pos.push(p.x, y1, p.y)
        nor.push(0, 1, 0)
        col.push(roof.r, roof.g, roof.b)
      }
    }
  }

  if (!pos.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeBoundingSphere()
  return g
}

function toV2(r: number[]) {
  const out: THREE.Vector2[] = []
  for (let i = 0; i < r.length; i += 2) out.push(new THREE.Vector2(r[i], r[i + 1]))
  return out
}

/** Flat road ribbons (segments overlap at joints, which reads fine for same-coloured asphalt). */
export function buildRoads(list: RoadLine[], y: number): THREE.BufferGeometry | null {
  const pos: number[] = []
  for (const road of list) {
    const h = road.width / 2
    const p = road.pts
    for (let i = 0; i < p.length - 2; i += 2) {
      let ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3]
      const dx = bx - ax, dz = bz - az
      const len = Math.hypot(dx, dz)
      if (len < 0.01) continue
      const ux = dx / len, uz = dz / len
      // extend by half a width so consecutive segments overlap round corners
      ax -= ux * h * 0.5; az -= uz * h * 0.5
      bx += ux * h * 0.5; bz += uz * h * 0.5
      const nx = -uz * h, nz = ux * h
      // quad a+n, a-n, b-n, b+n — wound to face +y
      pos.push(ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz)
      pos.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz)
    }
  }
  if (!pos.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const n = new Float32Array(pos.length)
  for (let i = 1; i < n.length; i += 3) n[i] = 1
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3))
  g.computeBoundingSphere()
  return g
}

/** Point-in-polygon (even-odd) on a flat [x, z, …] ring. */
export function inRing(r: number[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
