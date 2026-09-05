import { useState, useCallback, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMapEvents, useMap, Marker, Popup, Circle } from 'react-leaflet'
import type { LatLng } from 'leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './MapView.css'

// Custom vessel/user location marker icon with pulsating effect
const vesselLocationIcon = L.divIcon({
  className: 'vessel-location-marker',
  html: `
    <div class="vessel-marker-pulse"></div>
    <div class="vessel-marker-core">
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
      </svg>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
})

interface LocationData {
  lat: number
  lng: number
  accuracy: number
  timestamp: number
}

type TrackingStatus = 'idle' | 'requesting' | 'tracking' | 'following' | 'error'

/** Displays live mouse coordinates on the map */
function CoordinateTracker() {
  const [position, setPosition] = useState<LatLng | null>(null)

  useMapEvents({
    mousemove(e) {
      setPosition(e.latlng)
    },
    mouseout() {
      setPosition(null)
    },
  })

  if (!position) return null

  return (
    <div className="coordinate-display">
      <div className="coord-item">
        <span className="coord-label">Lat</span>
        <span className="coord-value">{position.lat.toFixed(6)}</span>
      </div>
      <div className="coord-divider" />
      <div className="coord-item">
        <span className="coord-label">Lng</span>
        <span className="coord-value">{position.lng.toFixed(6)}</span>
      </div>
    </div>
  )
}

/** Displays the current map center and zoom level */
function MapInfo() {
  const map = useMap()
  const [center, setCenter] = useState(map.getCenter())
  const [zoom, setZoom] = useState(map.getZoom())

  useMapEvents({
    moveend() {
      setCenter(map.getCenter())
    },
    zoomend() {
      setZoom(map.getZoom())
    },
  })

  return (
    <div className="map-info-panel">
      <div className="map-info-row">
        <svg className="map-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
        <span className="map-info-text">
          {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
        </span>
      </div>
      <div className="map-info-row">
        <svg className="map-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35M8 11h6M11 8v6" />
        </svg>
        <span className="map-info-text">Zoom: {zoom}</span>
      </div>
    </div>
  )
}

/** Location tracker component that handles geolocation, marker rendering, and follow-mode */
function LocationTracker() {
  const map = useMap()
  const [isTracking, setIsTracking] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [location, setLocation] = useState<LocationData | null>(null)
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const watchIdRef = useRef<number | null>(null)
  const isFollowingRef = useRef(false)

  // Keep ref in sync with state
  useEffect(() => {
    isFollowingRef.current = isFollowing
  }, [isFollowing])

  // Stop following user location when user manually drags the map
  useMapEvents({
    dragstart() {
      if (isFollowingRef.current) {
        setIsFollowing(false)
        isFollowingRef.current = false
      }
    },
  })

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [])

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setIsTracking(false)
    setIsFollowing(false)
    setStatus('idle')
    setLocation(null)
    setErrorMessage(null)
  }, [])

  const startTracking = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('error')
      setErrorMessage('Geolocation is not supported by your browser.')
      return
    }

    setErrorMessage(null)
    setStatus('requesting')
    setIsTracking(true)
    setIsFollowing(true)
    isFollowingRef.current = true

    // Clear any existing watcher before starting a new one
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        const newLoc: LocationData = {
          lat: latitude,
          lng: longitude,
          accuracy,
          timestamp: position.timestamp,
        }

        setLocation(newLoc)
        setStatus((prev) => (prev === 'requesting' || isFollowingRef.current ? 'following' : 'tracking'))

        // Auto-center map if follow mode is active
        if (isFollowingRef.current) {
          const currentZoom = map.getZoom()
          const targetZoom = Math.max(currentZoom, 14)
          map.setView([latitude, longitude], targetZoom, { animate: true })
        }
      },
      (error) => {
        let msg = 'Failed to obtain live location.'
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = 'Location permission denied. Please allow location access in browser settings.'
            break
          case error.POSITION_UNAVAILABLE:
            msg = 'Location position unavailable. Check your GPS connection.'
            break
          case error.TIMEOUT:
            msg = 'Location request timed out.'
            break
        }
        setStatus('error')
        setErrorMessage(msg)
        setIsTracking(false)
        setIsFollowing(false)
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current)
          watchIdRef.current = null
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )

    watchIdRef.current = watchId
  }, [map])

  const handleLocationButtonClick = useCallback(() => {
    if (!isTracking) {
      startTracking()
    } else if (!isFollowing && location) {
      // Re-enable follow mode and center map
      setIsFollowing(true)
      isFollowingRef.current = true
      setStatus('following')
      const targetZoom = Math.max(map.getZoom(), 14)
      map.setView([location.lat, location.lng], targetZoom, { animate: true })
    } else {
      // Already tracking & following -> click again to stop
      stopTracking()
    }
  }, [isTracking, isFollowing, location, startTracking, stopTracking, map])

  const handleResetFollow = useCallback(() => {
    if (location) {
      setIsFollowing(true)
      isFollowingRef.current = true
      setStatus('following')
      const targetZoom = Math.max(map.getZoom(), 14)
      map.setView([location.lat, location.lng], targetZoom, { animate: true })
    }
  }, [location, map])

  return (
    <>
      {/* Location Control Button in Map Toolbar */}
      <div className="location-control-group">
        <button
          className={`zoom-btn location-btn ${isTracking ? 'active' : ''} ${isFollowing ? 'following' : ''}`}
          onClick={handleLocationButtonClick}
          title={
            !isTracking
              ? 'My Location (Click to start tracking)'
              : isFollowing
                ? 'Tracking Location (Following) - Click to stop'
                : 'Re-center & Follow My Location'
          }
          aria-label="My Location"
        >
          {status === 'requesting' ? (
            <div className="btn-spinner" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="3" fill={isTracking ? 'currentColor' : 'none'} />
              <line x1="12" y1="2" x2="12" y2="4" />
              <line x1="12" y1="20" x2="12" y2="22" />
              <line x1="2" y1="12" x2="4" y2="12" />
              <line x1="20" y1="12" x2="22" y2="12" />
            </svg>
          )}
        </button>
      </div>

      {/* Vessel / Location Marker & Accuracy Circle */}
      {location && (
        <>
          <Circle
            center={[location.lat, location.lng]}
            radius={location.accuracy}
            pathOptions={{
              color: '#6366f1',
              fillColor: '#818cf8',
              fillOpacity: 0.15,
              weight: 1.5,
              dashArray: '4, 4',
            }}
          />
          <Marker position={[location.lat, location.lng]} icon={vesselLocationIcon}>
            <Popup className="vessel-popup">
              <div className="popup-content">
                <div className="popup-header">
                  <span className="popup-badge">🚢 Live Vessel GPS</span>
                  <span className="popup-time">{new Date(location.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="popup-body">
                  <div className="popup-row">
                    <span className="popup-label">Latitude:</span>
                    <span className="popup-val">{location.lat.toFixed(6)}°</span>
                  </div>
                  <div className="popup-row">
                    <span className="popup-label">Longitude:</span>
                    <span className="popup-val">{location.lng.toFixed(6)}°</span>
                  </div>
                  <div className="popup-row">
                    <span className="popup-label">Accuracy:</span>
                    <span className="popup-val">±{Math.round(location.accuracy)} m</span>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        </>
      )}

      {/* Location Information Panel */}
      {(isTracking || errorMessage) && (
        <div className={`location-info-panel ${errorMessage ? 'error' : ''}`}>
          <div className="location-info-header">
            <div className="status-indicator">
              <span
                className={`status-dot ${
                  status === 'following'
                    ? 'pulse-green'
                    : status === 'tracking'
                      ? 'pulse-yellow'
                      : status === 'requesting'
                        ? 'pulse-blue'
                        : 'dot-red'
                }`}
              />
              <span className="status-title">
                {status === 'following' && 'Tracking Location (Following)'}
                {status === 'tracking' && 'Tracking Location (Manual Pan)'}
                {status === 'requesting' && 'Acquiring GPS Signal...'}
                {status === 'error' && 'Location Error'}
              </span>
            </div>
            <button className="location-close-btn" onClick={stopTracking} title="Stop tracking">
              &times;
            </button>
          </div>

          {errorMessage ? (
            <div className="location-error-text">{errorMessage}</div>
          ) : (
            location && (
              <div className="location-details">
                <div className="loc-grid">
                  <div className="loc-grid-item">
                    <span className="loc-meta-label">Lat</span>
                    <span className="loc-meta-val">{location.lat.toFixed(6)}°</span>
                  </div>
                  <div className="loc-grid-item">
                    <span className="loc-meta-label">Lng</span>
                    <span className="loc-meta-val">{location.lng.toFixed(6)}°</span>
                  </div>
                  <div className="loc-grid-item">
                    <span className="loc-meta-label">Accuracy</span>
                    <span className="loc-meta-val">±{Math.round(location.accuracy)} m</span>
                  </div>
                </div>
                {!isFollowing && (
                  <button className="recenter-btn" onClick={handleResetFollow}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                      <circle cx="12" cy="12" r="8" />
                      <circle cx="12" cy="12" r="3" fill="currentColor" />
                    </svg>
                    Re-center Map
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}
    </>
  )
}

/** Custom zoom control buttons with location tracking integrated */
function CustomZoomControls() {
  const map = useMap()

  const handleZoomIn = useCallback(() => {
    map.zoomIn()
  }, [map])

  const handleZoomOut = useCallback(() => {
    map.zoomOut()
  }, [map])

  const handleResetView = useCallback(() => {
    map.setView([20.5937, 78.9629], 5) // Center of India
  }, [map])

  return (
    <div className="custom-zoom-controls">
      <button className="zoom-btn" onClick={handleZoomIn} title="Zoom In" aria-label="Zoom In">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button className="zoom-btn" onClick={handleZoomOut} title="Zoom Out" aria-label="Zoom Out">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <div className="zoom-divider" />
      <button className="zoom-btn" onClick={handleResetView} title="Reset View" aria-label="Reset View">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      </button>
    </div>
  )
}

interface MapViewProps {
  center?: [number, number]
  zoom?: number
}

export default function MapView({ center = [20.5937, 78.9629], zoom = 5 }: MapViewProps) {
  return (
    <div className="map-wrapper">
      <MapContainer
        center={center}
        zoom={zoom}
        zoomControl={false}
        className="map-container"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomright" />
        <CoordinateTracker />
        <MapInfo />
        <LocationTracker />
        <CustomZoomControls />
      </MapContainer>
    </div>
  )
}
