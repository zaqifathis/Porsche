/** Camera presets: [posX, posY, posZ, targetX, targetY, targetZ]. */
export type View = [number, number, number, number, number, number]
export const VIEW_HOME: View = [5.2, 1.9, 6.2, 0, 0.6, 0]
/** Showroom: a wider three-quarter view, aimed left of the car so it sits clear of the info panel. */
export const VIEW_SHOWROOM: View = [6.2, 2.1, 8.4, -1.5, 0.7, 0.4]
/** Showroom on a portrait phone: aim above the car so it sits below the info card. */
export const VIEW_SHOWROOM_PORTRAIT: View = [4.6, 3.4, 6.4, 0, 1.9, 0]
/** Behind and above the car (it faces +z), for driving in a city. */
export const VIEW_CHASE: View = [0, 2.8, -8.5, 0, 0.9, 2]
/** High and far behind, looking down over the car at the road ahead. */
export const VIEW_FAR: View = [0, 15, -27, 0, 0.4, 8]

/** Pull the camera back on narrow (portrait) screens so the whole car fits. */
export function fitView(v: View, aspect: number): View {
  const k = Math.max(1, 1.15 / aspect)
  return [v[3] + (v[0] - v[3]) * k, v[4] + (v[1] - v[4]) * k, v[5] + (v[2] - v[5]) * k, v[3], v[4], v[5]]
}

/** Place a car-relative view around the car's current position, height and heading. */
export function carView(v: View, pos: { x: number; y: number; z: number }, heading: number): View {
  const c = Math.cos(heading)
  const s = Math.sin(heading)
  const rx = (x: number, z: number) => pos.x + x * c + z * s
  const rz = (x: number, z: number) => pos.z - x * s + z * c
  return [rx(v[0], v[2]), pos.y + v[1], rz(v[0], v[2]), rx(v[3], v[5]), pos.y + v[4], rz(v[3], v[5])]
}
