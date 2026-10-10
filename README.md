# Porsche 911 Turbo (930) · 1975 — 3D viewer

Vite + React + TypeScript + React Three Fiber.

```bash
npm install
npm run dev
```

## Cars
Six Porsches, oldest to newest: **718 RSK (1959) · 911 Turbo 930 (1975) · Carrera GT (2004) · Cayenne S (2011) ·
911 Turbo S 992 (2020) · 911 GT3 Touring 992 (2022)**.

- Switch from the model name in the top-left menu. Click **PORSCHE** for the showroom: every car on a turntable in
  year order — ← / → to browse, Enter to drive the one in the spotlight, Esc to go back.
- Each car has sourced specs/history (`src/data/cars.ts`), its own top speed, acceleration, wheelbase and engine sound
  (cylinder count, redline, gearbox, turbo, air-cooled fan).
- New models are rigged generically (`src/scene/buildGenericCar.ts`): scaled to real length, faced forward, grounded on
  the tyres, paint/lamps matched by material name, and wheel geometry cut into four spinning/steering wheels.
  `node scripts/inspect-glb.mjs public/models/<car>.glb` lists materials and bounds to configure a new car.
- The 911 Turbo S source model has a door modelled open; `node scripts/close-911-door.mjs <scene.gltf> <out.glb>`
  closes it before optimising.
- Models were optimised with `gltf-transform optimize … --compress meshopt --texture-compress webp --texture-size 2048
  --flatten true --join true --instance false --palette false`.

Model credits (Sketchfab): 718 RSK and Carrera GT by OUTPISTON, Cayenne and GT3 Touring by Ddiaz Design
(all CC BY-NC-SA 4.0 — non-commercial), 911 Turbo S ("Porsche 911 with interior") by n.brizitskaya (CC BY 4.0),
930 by vecarz.com. The footer credits whichever car is on screen.

## Features
- Realistic PBR render: studio Lightformer environment, reflective floor, real-time sun shadow, bloom, AgX tone mapping
- **Drive** (up to 250 km/h) with arrow keys / WASD (on-screen pad on touch): endless grid floor, follow camera, wheels spin and front wheels steer
- Orbit / zoom (CameraControls), auto-rotate, reset
- **Hover** any part for name/spec, **click** for details; side panel has sourced specs + history
- **Paint**: period 930 colours + custom colour picker
- **Dark mode** toggle: lights go down, headlights/tail lights switch on (with beams)
- **Engine sound**: synthesised air-cooled turbo flat-six (AudioWorklet pulse model in 1-6-2-4-3-5 firing order, exhaust
  resonances, cooling-fan whine, turbo whistle, wastegate chuff, overrun burble); 4-speed gearbox; silent when parked; mute in the top bar
- **Map → city**: search any place (Photon geocoder), pick a preset city, or click anywhere on the map, then drive there. The city streams in z16 tiles
  around the car (5×5 ≈ 2 km): OSM buildings extruded to their heights, roads, and ground (water/parks) painted from
  vector data. Buildings are solid; chase camera swings behind the car while driving.
- **Blocks** look: plain massing (extruded OSM footprints). **Photoreal** look: Google 3D tiles (daylight only — night
  mode is disabled there).
- **Mini-map**: north-up OSM map following the car with a heading arrow (click to open the full map).

## Photoreal city (optional)
Real textured facades come from **Google Photorealistic 3D Tiles via Cesium ion**, streamed with
[3d-tiles-renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS) inside the same R3F scene.

1. Create a free account at https://ion.cesium.com, add the *Google Photorealistic 3D Tiles* asset (2275207) to it,
   and make an access token (scope `assets:read`, restricted to your site's URL — it is visible to the browser).
2. Either put it in `.env` (or `.env.local`) as `VITE_CESIUM_ION_TOKEN=…` — both are gitignored, see `.env.example` — or paste it in **Map → Photoreal**.

Without a token (or if ion rejects it) the city falls back to the OSM blocks below. OSM data still drives road
placement, building collision and the mini-map in photoreal mode. Draco decoder files live in `public/draco/`.

## City data
- Vector tiles: [OpenFreeMap](https://openfreemap.org/) (OpenMapTiles schema, © OpenStreetMap contributors) — no API key.
  z14 data tiles are decoded once and split into z16 render tiles (`src/city/`).
- Map picker: OpenStreetMap standard tiles via Leaflet.

## Model
`public/models/porsche930.glb` is the original from `model/*.zip`, compressed with
gltf-transform (meshopt + WebP, 90 MB → 8.7 MB):

```bash
npx gltf-transform optimize source.glb public/models/porsche930.glb \
  --compress meshopt --texture-compress webp --texture-size 2048 \
  --flatten false --join false --instance false --palette false --simplify false --prune false --weld false
```

Part names/details live in `src/data/parts.ts`; driving physics in `src/scene/drive.ts`.

Model: "Porsche 911 (930) Turbo 1975" by vecarz.com —
https://sketchfab.com/3d-models/porsche-911930-turbo-1975-wwwvecarzcom-1b576d8b56e445fe8595e1b3fc07bcfe
