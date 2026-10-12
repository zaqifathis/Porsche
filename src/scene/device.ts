/** Touch devices (phones/tablets) get lighter rendering settings. */
export const LITE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
