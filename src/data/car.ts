export interface Paint {
  name: string
  color: string
  metallic: number
  roughness: number
}

export const PAINTS: Paint[] = [
  { name: 'Original', color: '', metallic: 0.41, roughness: 0.3 },
  { name: 'Guards Red', color: '#b5121b', metallic: 0.1, roughness: 0.32 },
  { name: 'Grand Prix White', color: '#ece9e1', metallic: 0.05, roughness: 0.32 },
  { name: 'Black', color: '#0b0b0c', metallic: 0.2, roughness: 0.28 },
  { name: 'Silver Metallic', color: '#a7aaac', metallic: 0.85, roughness: 0.32 },
  { name: 'Minerva Blue', color: '#1d2a55', metallic: 0.65, roughness: 0.3 },
  { name: 'Ice Green Metallic', color: '#a8c3b5', metallic: 0.7, roughness: 0.3 },
  { name: 'Copper Brown', color: '#5a2f1d', metallic: 0.7, roughness: 0.3 },
  { name: 'Signal Orange', color: '#e15a12', metallic: 0.05, roughness: 0.32 },
]
