import MapView from './components/Map/MapView'
import './App.css'

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
          </div>
          <h1 className="brand-title">Antari's</h1>
        </div>
        <p className="header-subtitle">Interactive Geospatial Explorer</p>
      </header>
      <main className="app-main">
        <MapView center={[20.5937, 78.9629]} zoom={5} />
      </main>
    </div>
  )
}

export default App
