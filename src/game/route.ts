import type { RoadLine } from '../city/vectorSource'

/**
 * Road classes a route may use, with a cost factor: the line keeps to the main roads and only takes
 * smaller streets to get onto (or off) them. Service roads and tracks (alleys, driveways, courtyard
 * passages under buildings) are left out.
 */
const ROUTABLE: Record<string, number> = { motorway: 1, trunk: 1, primary: 1, secondary: 1, tertiary: 1.6, minor: 3 }
/** Vertices closer than this (m) are merged, so roads that meet at a junction link up. */
const SNAP = 1.5
/** Extra cost (m) for setting off backwards along the road the car is on. */
const TURN_BACK = 40

interface Graph {
  xs: Float64Array
  zs: Float64Array
  /** Adjacency: for node i, edges at adj[off[i] .. off[i + 1]) as neighbour indices, with cost factors in w. */
  off: Int32Array
  adj: Int32Array
  w: Float32Array
}

let cached: { version: number; graph: Graph } | null = null

/** Road network as a graph of shared vertices (rebuilt only when the loaded roads change). */
export function roadGraph(roads: RoadLine[], version: number): Graph {
  if (cached?.version === version) return cached.graph
  const ids = new Map<string, number>()
  const xs: number[] = []
  const zs: number[] = []
  const edges: number[] = []
  const factors: number[] = []
  const node = (x: number, z: number) => {
    const k = `${Math.round(x / SNAP)},${Math.round(z / SNAP)}`
    let i = ids.get(k)
    if (i === undefined) {
      i = xs.length
      ids.set(k, i)
      xs.push(x)
      zs.push(z)
    }
    return i
  }
  for (const r of roads) {
    const f = ROUTABLE[r.cls]
    if (!f) continue
    const p = r.pts
    let a = node(p[0], p[1])
    for (let i = 2; i < p.length; i += 2) {
      const b = node(p[i], p[i + 1])
      if (a !== b) {
        edges.push(a, b)
        factors.push(f)
      }
      a = b
    }
  }
  const n = xs.length
  const deg = new Int32Array(n + 1)
  for (let e = 0; e < edges.length; e += 2) {
    deg[edges[e]]++
    deg[edges[e + 1]]++
  }
  const off = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i]
  const fill = off.slice(0, n)
  const adj = new Int32Array(off[n])
  const w = new Float32Array(off[n])
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e], b = edges[e + 1], f = factors[e / 2]
    w[fill[a]] = f
    adj[fill[a]++] = b
    w[fill[b]] = f
    adj[fill[b]++] = a
  }
  const graph = { xs: Float64Array.from(xs), zs: Float64Array.from(zs), off, adj, w }
  cached = { version, graph }
  return graph
}

/** Where (x, z) meets the road network: the closest point on any road segment, and that segment's ends. */
function snap(g: Graph, x: number, z: number): { a: number; b: number; f: number; px: number; pz: number } | null {
  let best: { a: number; b: number; f: number; px: number; pz: number } | null = null
  let bd = Infinity
  for (let a = 0; a < g.xs.length; a++) {
    for (let e = g.off[a]; e < g.off[a + 1]; e++) {
      const b = g.adj[e]
      if (b < a) continue // each segment once
      const ax = g.xs[a], az = g.zs[a], dx = g.xs[b] - ax, dz = g.zs[b] - az
      const l2 = dx * dx + dz * dz
      const s = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0
      const px = ax + dx * s, pz = az + dz * s
      const d = Math.hypot(px - x, pz - z)
      if (d < bd) {
        bd = d
        best = { a, b, f: g.w[e], px, pz }
      }
    }
  }
  return best
}

/**
 * Shortest road route from (ax, az) to (bx, bz) as flat [x, z, …], A* over the road graph. Both ends
 * join the network at the nearest point on a road (not just the nearest junction, which can be across
 * a block); the car prefers setting off the way it faces (fx, fz). Null when the ends aren't connected.
 */
export function findRoute(g: Graph, ax: number, az: number, bx: number, bz: number, fx = 0, fz = 0): number[] | null {
  const s = snap(g, ax, az)
  const t = snap(g, bx, bz)
  if (!s || !t) return null
  const n = g.xs.length
  const cost = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const done = new Uint8Array(n)
  const h = (i: number) => Math.hypot(g.xs[i] - t.px, g.zs[i] - t.pz)
  // binary heap of [f, node]
  const heap: [number, number][] = []
  const push = (f: number, i: number) => {
    heap.push([f, i])
    let k = heap.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (heap[p][0] <= heap[k][0]) break
      ;[heap[p], heap[k]] = [heap[k], heap[p]]
      k = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let k = 0
      for (;;) {
        const l = 2 * k + 1, r = l + 1
        let m = k
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === k) break
        ;[heap[m], heap[k]] = [heap[k], heap[m]]
        k = m
      }
    }
    return top
  }

  // leave the car's road segment from either end (turning back costs extra)
  for (const i of [s.a, s.b]) {
    const dx = g.xs[i] - s.px, dz = g.zs[i] - s.pz
    cost[i] = Math.hypot(dx, dz) * s.f + (dx * fx + dz * fz < 0 ? TURN_BACK : 0)
    push(cost[i] + h(i), i)
  }
  // arrive along the target's segment from either end; or stay on the one segment when both share it
  const arrive = (i: number) => cost[i] + Math.hypot(g.xs[i] - t.px, g.zs[i] - t.pz) * t.f
  const sameSeg = (s.a === t.a && s.b === t.b) || (s.a === t.b && s.b === t.a)
  const direct = sameSeg && (t.px - s.px) * fx + (t.pz - s.pz) * fz >= 0 ? Math.hypot(t.px - s.px, t.pz - s.pz) * s.f : Infinity
  let best = direct
  let end = -1
  while (heap.length) {
    const [f, i] = pop()
    if (f >= best) break
    if (done[i]) continue
    done[i] = 1
    if (i === t.a || i === t.b) {
      const c = arrive(i)
      if (c < best) {
        best = c
        end = i
      }
    }
    for (let e = g.off[i]; e < g.off[i + 1]; e++) {
      const j = g.adj[e]
      const c = cost[i] + Math.hypot(g.xs[j] - g.xs[i], g.zs[j] - g.zs[i]) * g.w[e]
      if (c < cost[j]) {
        cost[j] = c
        prev[j] = i
        push(c + h(j), j)
      }
    }
  }
  if (best === Infinity) return null

  // car → its road → junctions → the target's road → target
  const out: number[] = [ax, az, s.px, s.pz]
  if (end >= 0) {
    const mid: number[] = []
    for (let i = end; i >= 0; i = prev[i]) mid.push(i)
    for (let k = mid.length - 1; k >= 0; k--) out.push(g.xs[mid[k]], g.zs[mid[k]])
  }
  out.push(t.px, t.pz, bx, bz)
  return out
}
