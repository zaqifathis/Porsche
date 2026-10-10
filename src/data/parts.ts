export type PartId =
  | 'body'
  | 'hood'
  | 'spoiler'
  | 'headlights'
  | 'taillights'
  | 'frontBumper'
  | 'rearBumper'
  | 'exhaust'
  | 'wheelFL'
  | 'wheelFR'
  | 'wheelRL'
  | 'wheelRR'
  | 'windshield'
  | 'rearWindow'
  | 'sideWindows'
  | 'wipers'
  | 'mirrors'
  | 'interior'
  | 'steering'
  | 'dashboard'
  | 'freshener'
  // generic categories for the other cars
  | 'glass'
  | 'brakes'
  | 'trim'

/** GLB mesh name → part. Unlisted meshes default to body (exterior) or interior (cabin). */
export const MESH_TO_PART: Record<string, PartId> = {
  // front luggage lid
  Object_49: 'hood',
  Object_130: 'hood',
  // whale tail
  'Object_162.001': 'spoiler',
  // front lighting
  Object_203: 'headlights',
  Object_150: 'headlights',
  Object_40: 'headlights',
  Object_153: 'headlights',
  Object_209: 'headlights',
  Object_197: 'headlights',
  // rear lighting
  'Object_206.001': 'taillights',
  'Object_194.001': 'taillights',
  Object_37: 'taillights',
  Object_34: 'taillights',
  Object_67: 'taillights',
  Object_64: 'taillights',
  // bumpers
  Object_84: 'frontBumper',
  Object_81: 'frontBumper',
  Object_159: 'frontBumper',
  'Object_156.001': 'frontBumper',
  Object_70: 'frontBumper',
  Object_72: 'frontBumper',
  'Object_100.001': 'frontBumper',
  Object_215: 'frontBumper',
  Object_46: 'rearBumper',
  'Object_174.001': 'rearBumper',
  Object_171: 'rearBumper',
  Object_61: 'rearBumper',
  'Object_200.001': 'rearBumper',
  Object_97: 'rearBumper',
  'Object_212.001': 'rearBumper',
  Object_31: 'rearBumper',
  // plates travel with their bumpers
  'Object_8.001': 'frontBumper',
  Object_10: 'frontBumper',
  Object_12: 'frontBumper',
  Object_123: 'rearBumper',
  Object_125: 'rearBumper',
  Object_127: 'rearBumper',
  // exhaust
  Object_92: 'exhaust',
  Object_94: 'exhaust',
  // wheels (+z is forward, +x is the car's left)
  Object_139: 'wheelFL',
  Object_141: 'wheelFL',
  Object_20: 'wheelFR',
  Object_22: 'wheelFR',
  Object_183: 'wheelRL',
  Object_185: 'wheelRL',
  Object_15: 'wheelRR',
  Object_17: 'wheelRR',
  // glazing
  Object_75: 'windshield',
  Object_58: 'rearWindow',
  Object_144: 'rearWindow',
  'Object_168.001': 'rearWindow',
  Object_28: 'rearWindow',
  Object_43: 'sideWindows',
  // wipers
  Object_55: 'wipers',
  'Object_108.001': 'wipers',
  Object_111: 'wipers',
  Object_117: 'wipers',
  'Object_120.001': 'rearWindow',
  'Object_114.001': 'rearWindow',
  // mirrors / brightwork
  'Object_180.001': 'mirrors',
  'Object_136.001': 'mirrors',
  // cockpit
  Object_290: 'steering',
  Object_292: 'steering',
  Object_294: 'steering',
  Object_296: 'steering',
  Object_298: 'steering',
  Object_300: 'steering',
  Object_168: 'dashboard',
  Object_136: 'dashboard',
  Object_140: 'dashboard',
  Object_172: 'dashboard',
  Object_38: 'dashboard',
  Object_146: 'dashboard',
  Object_191: 'freshener',
}

