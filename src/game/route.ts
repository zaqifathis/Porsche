import type { RoadLine } from '../city/vectorSource'

/** Road classes a route may use (tracks are often unpaved paths). */
const ROUTABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'])
/** Vertices closer than this (m) are merged, so roads that meet at a junction link up. */
const SNAP = 1.5

interface Graph {
  xs: Float64Array
  zs: Float64Array
  /** Adjacency: for node i, edges at adj[off[i] .. off[i + 1]) as neighbour indices. */
  off: Int32Array
  adj: Int32Array
}

let cached: { version: number; graph: Graph } | null = null

/** Road network as a graph of shared vertices (rebuilt only when the loaded roads change). */
export function roadGraph(roads: RoadLine[], version: number): Graph {
  if (cached?.version === version) return cached.graph
  const ids = new Map<string, number>()
  const xs: number[] = []
  const zs: number[] = []
  const edges: number[] = []
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
    if (!ROUTABLE.has(r.cls)) continue
    const p = r.pts
    let a = node(p[0], p[1])
    for (let i = 2; i < p.length; i += 2) {
      const b = node(p[i], p[i + 1])
      if (a !== b) edges.push(a, b)
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
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e], b = edges[e + 1]
    adj[fill[a]++] = b
    adj[fill[b]++] = a
  }
  const graph = { xs: Float64Array.from(xs), zs: Float64Array.from(zs), off, adj }
  cached = { version, graph }
  return graph
}

/** Closest connected node; with a facing (fx, fz), nodes behind count as 25 m further away. */
function nearest(g: Graph, x: number, z: number, fx = 0, fz = 0): number {
  let best = -1
  let bd = Infinity
  for (let i = 0; i < g.xs.length; i++) {
    if (g.off[i + 1] === g.off[i]) continue
    const dx = g.xs[i] - x, dz = g.zs[i] - z
    const d = Math.hypot(dx, dz) + (dx * fx + dz * fz < 0 ? 25 : 0)
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

/**
 * Shortest road route from (ax, az) to (bx, bz) as flat [x, z, …], A* over the road graph, joining
 * the network ahead of the facing (fx, fz) when it can. Null when the ends aren't connected.
 */
export function findRoute(g: Graph, ax: number, az: number, bx: number, bz: number, fx = 0, fz = 0): number[] | null {
  const s = nearest(g, ax, az, fx, fz)
  const t = nearest(g, bx, bz)
  if (s < 0 || t < 0) return null
  const n = g.xs.length
  const cost = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const done = new Uint8Array(n)
  const h = (i: number) => Math.hypot(g.xs[i] - g.xs[t], g.zs[i] - g.zs[t])
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
    return top[1]
  }

  cost[s] = 0
  push(h(s), s)
  while (heap.length) {
    const i = pop()
    if (done[i]) continue
    if (i === t) break
    done[i] = 1
    for (let e = g.off[i]; e < g.off[i + 1]; e++) {
      const j = g.adj[e]
      const c = cost[i] + Math.hypot(g.xs[j] - g.xs[i], g.zs[j] - g.zs[i])
      if (c < cost[j]) {
        cost[j] = c
        prev[j] = i
        push(c + h(j), j)
      }
    }
  }
  if (s !== t && prev[t] < 0) return null

  const path: number[] = [bx, bz]
  for (let i = t; i >= 0; i = prev[i]) path.push(g.xs[i], g.zs[i])
  path.push(ax, az)
  // reverse pairs → car first
  const out: number[] = []
  for (let i = path.length - 2; i >= 0; i -= 2) out.push(path[i], path[i + 1])
  return out
}
