// The "Porsche 911 with interior" model ships with its passenger door (node `door_2`) swung open.
// Both doors are authored in car space, so closing it = giving door_2 the same transform as door_1.
// Usage: node scripts/close-911-door.mjs <scene.gltf> <out.glb>   (then run gltf-transform optimize)
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const [src, out] = process.argv.slice(2)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(src)
const nodes = doc.getRoot().listNodes()
const closed = nodes.find((n) => n.getName() === 'door_1')
const open = nodes.find((n) => n.getName() === 'door_2')
if (!closed || !open) throw new Error('door_1 / door_2 not found')
open.setMatrix(closed.getMatrix())
await io.write(out, doc)
console.log('closed door_2 →', out)
