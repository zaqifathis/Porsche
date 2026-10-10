export interface Source {
  label: string
  url: string
}

export interface CarSpec {
  label: string
  value: string
  /** Index into the car's `sources`. */
  src: number
}

export interface CarDef {
  id: string
  /** GLB under public/models. */
  file: string
  year: number
  name: string
  code: string
  tagline: string
  specs: CarSpec[]
  history: { year: string; text: string; src: number }[]
  sources: Source[]
  /** 3D model credit (required by the Sketchfab licences). */
  credit: { title: string; author: string; url: string; license: string }
  /**
   * How to normalise and rig a downloaded model. Absent for the 930, which has its own
   * hand-tuned rig (doorless split, named parts, hover details) in buildCar.ts.
   */
  rig?: {
    /** Real length in metres; the model is scaled to it. */
    length: number
    /** Real width (metres) for collisions, when the model's bounds are misleading (e.g. an open door). */
    width?: number
    /** Which model axis points to the car's nose. */
    front: '+x' | '-x' | '+z' | '-z'
    paint: RegExp
    /** Lamp materials: front half lights up white, rear half red. */
    lamps: RegExp
    /** Always-red rear lamp glass. */
    tail?: RegExp
    /** Tyre material(s): used to find the four wheel centres and the ground. */
    tyres: RegExp
    /** Everything that turns with the wheel (tyre, rim, disc). Calipers excluded. */
    wheels: RegExp
  }
  drive: { topSpeed: number; accel: number }
  engine: { cylinders: 4 | 6 | 8 | 10; redline: number; idle: number; turbo: boolean; airCooled: boolean; gearTops: number[] }
}

const wiki = (page: string, label: string): Source => ({ label: `Wikipedia — ${label}`, url: `https://en.wikipedia.org/wiki/${page}` })

/** Ordered by production year (the showroom carousel follows this order). */
export const CARS: CarDef[] = [
  {
    id: '718-rsk',
    file: '718-rsk.glb',
    year: 1959,
    name: '718 RSK',
    code: 'Spyder',
    tagline: 'Mid-engined racer that won the 1959 Targa Florio outright.',
    specs: [
      { label: 'Engine', value: '1.5 L flat-4 (Type 547)', src: 0 },
      { label: 'Power', value: '142 hp', src: 0 },
      { label: 'Weight', value: '570 kg', src: 0 },
      { label: 'Built', value: '34 (1957–59)', src: 2 },
    ],
    history: [
      { year: '1957', text: 'Le Mans debut with Umberto Maglioli and Edgar Barth; leading the 2-litre class when an accident ends its race in the night.', src: 1 },
      { year: '1958', text: 'Le Mans: RSKs finish third (Behra/Herrmann, 1.6 L) and fourth (Barth/Frère, 1.5 L) overall, behind only Ferrari and Aston Martin.', src: 1 },
      { year: '1958', text: 'Targa Florio: Jean Behra and Giorgio Scarlatti finish second overall and win the 1.5-litre class.', src: 1 },
      { year: '1959', text: 'Edgar Barth and Wolfgang Seidel win the Targa Florio outright; Barth also becomes European Hill Climb Champion.', src: 1 },
      { year: '1959', text: 'Production ends: 34 cars of the type were built from 1957, the first ten of them prototypes.', src: 2 },
    ],
    sources: [
      wiki('Porsche_718', 'Porsche 718'),
      { label: 'Stuttcars — Porsche 718 RSK: The Story', url: 'https://www.stuttcars.com/porsche-718-rsk-the-story/' },
      { label: "RM Sotheby's — 1959 Porsche 718 RSK Werks Spyder", url: 'https://rmsothebys.com/auctions/mo22/lots/r0108-1959-porsche-718-rsk-werks-spyder' },
    ],
    credit: {
      title: '1959 Porsche 718 RSK',
      author: 'OUTPISTON',
      url: 'https://sketchfab.com/3d-models/1959-porsche-718-rsk-dbf16392121249d19ff643ae0655a301',
      license: 'CC BY-NC-SA 4.0',
    },
    rig: {
      length: 3.8,
      front: '+z',
      paint: /mm_ext$/,
      lamps: /mm_lights$/,
      tyres: /mm_tyre$/,
      wheels: /mm_(tyre|wheel|rotor)$/,
    },
    drive: { topSpeed: 240, accel: 9 },
    engine: { cylinders: 4, redline: 8000, idle: 1100, turbo: false, airCooled: true, gearTops: [70, 110, 150, 195, 240] },
  },
  {
    id: '930',
    file: 'porsche930.glb',
    year: 1975,
    name: '911 Turbo',
    code: 'Type 930',
    tagline: "Germany's fastest road-legal production car at launch.",
    specs: [
      { label: 'Engine', value: '3.0 L flat-6 turbo', src: 0 },
      { label: 'Power', value: '260 PS', src: 0 },
      { label: 'Torque', value: '329 Nm', src: 4 },
      { label: '0–100 km/h', value: '5.5 s', src: 0 },
      { label: 'Top speed', value: '250 km/h', src: 0 },
      { label: 'Weight', value: '1,140 kg', src: 0 },
    ],
    history: [
      { year: '1973', text: 'A 911 RSR Turbo concept is shown at the IAA in Frankfurt on 13 September, previewing the road car.', src: 1 },
      { year: '1974', text: 'The production 911 Turbo 3.0 is unveiled at the Paris Motor Show on 3 October. Internally it is the Type 930.', src: 1 },
      { year: '1975', text: "Deliveries begin. With 260 PS it is Germany's fastest road-legal production car, yet comes with full leather and automatic heating.", src: 0 },
      { year: '1977', text: 'A boost gauge, 16-inch wheels and power brakes are added. 2,850 Turbo 3.0s are built in the first three years.', src: 2 },
      { year: '1978', text: 'Displacement grows to 3.3 litres, with a charge-air cooler under the rear spoiler — a world first for a production car. Output: 300 PS.', src: 2 },
      { year: '1989', text: 'The final 930 year: a five-speed G50 manual is standard from October 1988, and 1,496 coupés are built in a run shortened to nine months.', src: 3 },
    ],
    sources: [
      {
        label: 'Porsche Museum — 911 Turbo 3.0 Coupé datasheet',
        url: 'https://newsroom.porsche.com/dam/jcr:3c07547c-36bc-4e00-825c-5ac2bbe10805/Datenblatt%20911%20Turbo%203.0%20Coup%C3%A9.pdf',
      },
      {
        label: 'Porsche Newsroom — 50 Years of Turbo: The beginning of the series',
        url: 'https://newsroom.porsche.com/en/press-kits/50-years-porsche-turbo/The-beginning-of-the-series.html',
      },
      {
        label: 'Porsche Newsroom — 50 Years of Turbo: The 911 Turbo generations',
        url: 'https://newsroom.porsche.com/en/press-kits/50-years-porsche-turbo/The-911-Turbo-generations.html',
      },
      { label: "RM Sotheby's — 1989 Porsche 911 Turbo Coupé", url: 'https://rmsothebys.com/auctions/am16/lots/r103-1989-porsche-911-turbo-coupe/' },
      wiki('Porsche_930', 'Porsche 930'),
    ],
    credit: {
      title: 'Porsche 911 (930) Turbo 1975',
      author: 'vecarz',
      url: 'https://sketchfab.com/3d-models/porsche-911930-turbo-1975-wwwvecarzcom-1b576d8b56e445fe8595e1b3fc07bcfe',
      license: 'CC BY-NC-SA 4.0',
    },
    drive: { topSpeed: 250, accel: 14 },
    engine: { cylinders: 6, redline: 6800, idle: 900, turbo: true, airCooled: true, gearTops: [70, 120, 180, 255] },
  },
  {
    id: 'carrera-gt',
    file: 'carrera-gt.glb',
    year: 2004,
    name: 'Carrera GT',
    code: 'Type 980',
    tagline: 'A race-bred V10 in a carbon-fibre monocoque, with a manual gearbox.',
    specs: [
      { label: 'Engine', value: '5.7 L V10', src: 0 },
      { label: 'Power', value: '612 PS', src: 0 },
      { label: 'Torque', value: '590 Nm', src: 0 },
      { label: 'Top speed', value: '330 km/h', src: 1 },
      { label: 'Weight', value: '1,380 kg', src: 1 },
      { label: 'Built', value: '1,270', src: 0 },
    ],
    history: [
      { year: '1999', text: 'Porsche shelves its LMP 2000 Le Mans prototype to focus on series models — but keeps the V10 engine developed for it.', src: 0 },
      { year: '2000', text: 'Shown at the Paris Motor Show in September as a near-production study; Walter Röhrl drives it through Paris for the press.', src: 0 },
      { year: '2003', text: 'Series production starts in autumn: an all-carbon monocoque, a ceramic clutch and a six-speed manual gearbox.', src: 0 },
      { year: '2006', text: 'Production ends in May after 1,270 hand-built cars from Zuffenhausen and Leipzig.', src: 0 },
    ],
    sources: [
      {
        label: 'Porsche Newsroom — Carrera GT: a legendary supercar marks its milestone (2025)',
        url: 'https://newsroom.porsche.com/en/2025/history/porsche-25-years-world-premiere-carrera-gt-40609.html',
      },
      wiki('Porsche_Carrera_GT', 'Porsche Carrera GT'),
    ],
    credit: {
      title: '2004 Porsche Carrera GT',
      author: 'OUTPISTON',
      url: 'https://sketchfab.com/3d-models/2004-porsche-carrera-gt-9d48aa751ab24becbf7110e93c8a7a1f',
      license: 'CC BY-NC-SA 4.0',
    },
    rig: {
      length: 4.613,
      front: '+z',
      paint: /C1_Paint$/,
      lamps: /C1_Light$/,
      tail: /C1_Vidiro_Rojo$/,
      tyres: /Wheel1A/,
      wheels: /Wheel1A/,
    },
    drive: { topSpeed: 330, accel: 20 },
    engine: { cylinders: 10, redline: 8400, idle: 1000, turbo: false, airCooled: false, gearTops: [80, 125, 170, 215, 265, 330] },
  },
  {
    id: 'cayenne',
    file: 'cayenne.glb',
    year: 2011,
    name: 'Cayenne S',
    code: 'Type 92A',
    tagline: 'The second-generation Cayenne: lighter, more efficient, and the start of Porsche hybrids.',
    specs: [
      { label: 'Engine', value: '4.8 L V8', src: 0 },
      { label: 'Power', value: '400 PS', src: 0 },
      { label: 'Torque', value: '500 Nm', src: 1 },
      { label: 'Body', value: '5-door SUV', src: 0 },
    ],
    history: [
      { year: '2002', text: 'The first Cayenne premieres; its deliveries go on to exceed Porsche’s own expectations.', src: 0 },
      { year: '2010', text: 'The second generation launches. The body is 111 kg lighter (39 kg from doors and lids alone) and the drivetrain 33 kg lighter without its transfer case.', src: 0 },
      { year: '2010', text: 'The Cayenne S Hybrid (380 PS) becomes Porsche’s first series-production hybrid.', src: 0 },
      { year: '2017', text: '535,903 second-generation Cayennes have been delivered from Leipzig since 2010 — roughly double the first generation.', src: 0 },
    ],
    sources: [
      {
        label: 'Porsche Newsroom — A new generation: how the Porsche Cayenne became even sportier (2022)',
        url: 'https://newsroom.porsche.com/en/2022/products/porsche-cayenne-anniversary-20-years-second-generation-e2-29587.html',
      },
      wiki('Porsche_Cayenne', 'Porsche Cayenne'),
    ],
    credit: {
      title: '2011 Porsche Cayenne',
      author: 'Ddiaz Design',
      url: 'https://sketchfab.com/3d-models/2011-porsche-cayenne-c781eeb2c0e14f6e94d21feef6b5e7b3',
      license: 'CC BY-NC-SA 4.0',
    },
    rig: {
      length: 4.846,
      front: '+z',
      paint: /^CarPaint$/,
      lamps: /^(Lights|Light_Glass)$/,
      tail: /^Red_glass$/,
      tyres: /^Tire$/,
      wheels: /^(Tire|material|Disk)$/,
    },
    drive: { topSpeed: 258, accel: 11 },
    engine: { cylinders: 8, redline: 6700, idle: 700, turbo: false, airCooled: false, gearTops: [55, 95, 140, 180, 220, 258] },
  },
  {
    id: '911-turbo-s',
    file: '911-turbo-s.glb',
    year: 2020,
    name: '911 Turbo S',
    code: 'Type 992',
    tagline: '650 PS and 0–100 km/h in 2.7 seconds.',
    specs: [
      { label: 'Engine', value: '3.7 L flat-6, twin VTG turbo', src: 1 },
      { label: 'Power', value: '650 PS', src: 1 },
      { label: 'Torque', value: '800 Nm', src: 1 },
      { label: '0–100 km/h', value: '2.7 s', src: 1 },
      { label: 'Top speed', value: '330 km/h', src: 1 },
      { label: 'Weight', value: '1,640 kg', src: 2 },
    ],
    history: [
      { year: '2020', text: 'With the Geneva Motor Show cancelled, the new 911 Turbo S premieres by live stream on 3 March, presented by Mark Webber, as Coupé and Cabriolet.', src: 0 },
      { year: '2020', text: 'Its 3,745 cc flat-six with two VTG turbochargers makes 70 PS and 50 Nm more than before; 0–100 km/h drops by 0.2 s to 2.7 s.', src: 1 },
    ],
    sources: [
      {
        label: 'Porsche Newsroom — Flagship of the 911 series with live stream premiere (2020)',
        url: 'https://newsroom.porsche.com/en/2020/products/porsche-flagship-911-series-world-premiere-live-stream-mark-webber-20054.html',
      },
      {
        label: 'Porsche Schweiz — 911 Turbo S press release, 3 March 2020 (German)',
        url: 'https://newsroom.porsche.com/dam/jcr:0f2efbc7-f66f-480f-bf1e-ffd21589fa72/PCH20_0093_ch_de.pdf',
      },
      wiki('Porsche_992', 'Porsche 992'),
    ],
    credit: {
      title: 'Porsche 911 with interior',
      author: 'n.brizitskaya',
      url: 'https://sketchfab.com/3d-models/porsche-911-with-interior-877b1bc1739f4a2bb65d62fd7ffd9f75',
      license: 'CC BY 4.0',
    },
    rig: {
      length: 4.535,
      width: 1.9, // body width without mirrors (door_2 is closed by scripts/close-911-door.mjs)
      front: '+x',
      paint: /^body_main$/,
      lamps: /^(lights|headlights_pattern)$/,
      tail: /^red_light_main$/,
      tyres: /^tires$/,
      wheels: /^(tires|rim_black|rim_chrome|Discs)$/,
    },
    drive: { topSpeed: 330, accel: 22 },
    engine: { cylinders: 6, redline: 7200, idle: 850, turbo: true, airCooled: false, gearTops: [60, 95, 135, 175, 215, 255, 295, 330] },
  },
  {
    id: 'gt3-touring',
    file: 'gt3-touring.glb',
    year: 2022,
    name: '911 GT3 Touring',
    code: 'Type 992',
    tagline: 'The GT3 without the wing: a 9,000 rpm flat-six and a manual gearbox.',
    specs: [
      { label: 'Engine', value: '4.0 L flat-6', src: 0 },
      { label: 'Power', value: '510 PS', src: 0 },
      { label: 'Torque', value: '470 Nm', src: 1 },
      { label: 'Redline', value: '9,000 rpm', src: 1 },
      { label: '0–100 km/h', value: '3.9 s (manual)', src: 1 },
      { label: 'Weight', value: '1,418 kg (manual)', src: 0 },
    ],
    history: [
      { year: '1973', text: 'The “Touring” name first appears, as an equipment variant of the 911 Carrera RS.', src: 0 },
      { year: '2017', text: 'Porsche revives the Touring Package for the 991-generation 911 GT3.', src: 0 },
      { year: '2021', text: 'The 992 GT3 Touring premieres in June: no fixed wing but an extending spoiler, a 4.0 L flat-six derived from the GT3 R racer, a six-speed manual as standard and — for the first time — PDK at no extra cost.', src: 0 },
    ],
    sources: [
      {
        label: 'Porsche Newsroom — The new Porsche 911 GT3 with Touring Package (2021)',
        url: 'https://newsroom.porsche.com/en_AU/2021/products/porsche-911-gt3-touring-package-premiere-24800.html',
      },
      wiki('Porsche_911_GT3', 'Porsche 911 GT3'),
    ],
    credit: {
      title: '2022 Porsche 911 GT3 Touring (992)',
      author: 'Ddiaz Design',
      url: 'https://sketchfab.com/3d-models/2022-porsche-911-gt3-touring-992-a76364a3d50c4d78912a28250cb57be5',
      license: 'CC BY-NC-SA 4.0',
    },
    rig: {
      length: 4.573,
      front: '+z',
      paint: /Paint_Material$/,
      lamps: /LightA_Material$/,
      tail: /^RED_GLASS$/,
      tyres: /Wheel1A/,
      wheels: /Wheel1A/,
    },
    drive: { topSpeed: 320, accel: 19 },
    engine: { cylinders: 6, redline: 9000, idle: 950, turbo: false, airCooled: false, gearTops: [75, 115, 160, 205, 255, 320] },
  },
]

export const DEFAULT_CAR = '930'
export const carById = (id: string) => CARS.find((c) => c.id === id) ?? CARS[1]
