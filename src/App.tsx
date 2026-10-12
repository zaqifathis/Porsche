import { useEffect, useRef } from 'react'
import type { CameraControls } from '@react-three/drei'
import { Scene } from './scene/Scene'
import { VIEW_HOME, fitView } from './scene/views'
import { CityBadge, DriveHud, InfoPanel, Loader, PaintPicker, ShowroomOverlay, Toolbar, TopBar } from './components/Overlay'
import { MapPicker } from './components/MapPicker'
import { MiniMap } from './components/MiniMap'
import { GameHud } from './game/GameHud'
import { engine } from './audio/engine'
import { bindDriveKeys, drive, resetDrive } from './scene/drive'
import { photorealActive, useStore } from './store'
import { CARS, carById } from './data/cars'

export default function App() {
  const dark = useStore((s) => s.dark)
  const controls = useRef<CameraControls | null>(null)

  const muted = useStore((s) => s.muted)
  const mode = useStore((s) => s.mode)
  const photoreal = useStore(photorealActive)
  const carId = useStore((s) => s.carId)
  const showroomIndex = useStore((s) => s.showroomIndex)
  // credit the model on screen (the showroom shows the one in the spotlight)
  const shown = mode === 'showroom' ? CARS[showroomIndex] : carById(carId)

  useEffect(() => bindDriveKeys(), [])

  // browsers only allow audio after a user gesture: start the engine on the first one
  useEffect(() => {
    const start = () => engine.start()
    window.addEventListener('keydown', start)
    window.addEventListener('pointerdown', start)
    return () => {
      window.removeEventListener('keydown', start)
      window.removeEventListener('pointerdown', start)
    }
  }, [])
  useEffect(() => engine.setMuted(muted), [muted])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  const reset = () => {
    const s = useStore.getState()
    if (s.autoRotate) s.toggleAutoRotate()
    if (drive.respawn) {
      drive.respawn() // in a city: back onto the nearest road to the start point
      return
    }
    resetDrive()
    controls.current?.setLookAt(...fitView(VIEW_HOME, window.innerWidth / window.innerHeight), true)
  }

  return (
    <main className="app">
      <div className="canvas-wrap">
        <Scene controlsRef={controls} />
      </div>
      <TopBar />
      {mode === 'showroom' ? (
        <ShowroomOverlay />
      ) : (
        <>
          <InfoPanel />
          <div className="bottom">
            <PaintPicker />
            <Toolbar onReset={reset} />
          </div>
          <CityBadge />
          <DriveHud />
          <MiniMap />
          <GameHud />
        </>
      )}
      <MapPicker />
      <Loader />
      <footer className="credit">
        {photoreal && (
          <>
            3D tiles: Google via{' '}
            <a href="https://cesium.com/platform/cesium-ion/" target="_blank" rel="noreferrer">
              Cesium ion
            </a>
            {' · '}
          </>
        )}
        {mode === 'city' && (
          <>
            Map data ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>{' '}
            ·{' '}
            <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">
              OpenMapTiles
            </a>{' '}
            ·{' '}
            <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
              OpenFreeMap
            </a>{' '}
            {' · '}
          </>
        )}
        Model: “{shown.credit.title}” by {shown.credit.author} via{' '}
        <a href={shown.credit.url} target="_blank" rel="noreferrer">
          Sketchfab
        </a>
        {shown.credit.license !== 'Sketchfab' && ` (${shown.credit.license})`}
      </footer>
    </main>
  )
}
