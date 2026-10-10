// Dev tool: list a GLB's materials with their world-space bounds (used to configure src/data/cars.ts).
// Usage: node scripts/inspect-glb.mjs public/models/<car>.glb
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { getBounds } from '@gltf-transform/core'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f)
  const root = doc.getRoot()
  const scene = root.listScenes()[0]
  const sb = getBounds(scene)
  console.log('#####', f, 'meshes', root.listMeshes().length, 'nodes', root.listNodes().length, 'scene', sb.min.map(v=>+v.toFixed(3)), sb.max.map(v=>+v.toFixed(3)))
  const rows = []
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue
    const b = getBounds(node)
    for (const p of mesh.listPrimitives()) {
      rows.push([p.getMaterial()?.getName() ?? '?', node.getName(), b.min.map(v=>+v.toFixed(3)), b.max.map(v=>+v.toFixed(3)), p.getAttribute('POSITION').getCount()])
    }
  }
  const byMat = {}
  for (const r of rows) (byMat[r[0]] ??= []).push(r)
  for (const [m, rs] of Object.entries(byMat)) console.log(' ', m.slice(0,60).padEnd(60), rs.length, 'prims', rs.map(r => r[4]).reduce((a,b)=>a+b,0), 'v', JSON.stringify(rs[0][2]), JSON.stringify(rs[0][3]))
}
