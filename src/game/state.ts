import * as THREE from 'three'
import type { RoadLine } from '../city/vectorSource'

/** Diamonds to collect in each city before the portal opens. */
export const GEMS_PER_CITY = 10
/** Pick-up radius (m) around a diamond, measured on the ground plane. */
export const GEM_RADIUS = 6
/** Driving into this radius (m) of the portal's centre warps to the next city. */
export const PORTAL_RADIUS = 6

/** Mutable game state read every frame (kept out of React, like `drive`). */
export const game = {
  /** Where the current target (next diamond, or the portal) sits; null while none is placed. */
  target: null as THREE.Vector3 | null,
  /** Heading of the road at the target, so the portal faces down the street. */
  targetHeading: 0,
  /**
   * Random point on a road of one of `classes` between `min` and `max` metres from (x, z), with the
   * road's heading there (set by the city once its road data streams in).
   */
  sampleRoad: null as
    | ((x: number, z: number, min: number, max: number, classes: Set<string>) => { x: number; z: number; heading: number } | null)
    | null,
  /** Every loaded road line, for route finding (set by the city). */
  roads: null as (() => RoadLine[]) | null,
  /** Bumped whenever the loaded roads change, so a cached road graph knows to rebuild. */
  roadsVersion: 0,
}

/** Which way-finder is shown: a floating arrow over the car, or a route line along the roads. */
export type Guide = 'arrow' | 'route'

export function resetGame() {
  game.target = null
  game.targetHeading = 0
}

if (import.meta.env.DEV) Object.assign(window, { __game: game })
