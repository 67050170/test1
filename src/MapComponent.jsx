// src/MapComponent.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Popup, Source } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css'; // สไตล์หลักของ Mapbox
import './MapComponent.css'; // สไตล์ที่เรากำหนดเองสำหรับคอมโพเนนต์นี้

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const WEATHER_API_KEY = 'e014bad153ffd6b9936edfa65334cc44';

/**
 * สร้างข้อมูล GeoJSON รูปวงกลม
 * @param {[number, number]} center - [lng, lat] ของจุดศูนย์กลาง
 * @param {number} radiusInKm - รัศมีในหน่วยกิโลเมตร
 * @param {number} points - จำนวนจุดที่จะใช้สร้างวงกลม (ยิ่งเยอะยิ่งเนียน)
 * @returns {GeoJSON.Feature<GeoJSON.Polygon>}
 */
function createGeoJSONCircle([lng, lat], radiusInKm, points = 64) {
  if (!lng || !lat || !radiusInKm) return null;

  const coords = { latitude: lat, longitude: lng };
  const km = radiusInKm;
  const ret = [];
  const distanceX = km / (111.320 * Math.cos(coords.latitude * Math.PI / 180));
  const distanceY = km / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ret]
    },
    properties: {}
  };
}

/**
 * คำนวณระยะห่างระหว่างพิกัด 2 จุด (Haversine formula)
 * หมายเหตุ: สูตรนี้เป็นสูตรคณิตศาสตร์มาตรฐาน (Haversine formula) และเป็นสาธารณสมบัติ (Public Domain)
 * จึงไม่มีข้อกังวลด้านลิขสิทธิ์และสามารถใช้งานได้อย่างปลอดภัย
 * @returns {number} ระยะห่างในหน่วยกิโลเมตร
 */
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function MapComponent({ 
  onDroneChange = () => {}, 
  onLog = () => {},
  onEnterNoFlyZone = () => {}, // Prop สำหรับแจ้งเตือน "เข้า"
  onExitNoFlyZone = () => {}, // Prop ใหม่สำหรับแจ้งเตือน "ออก"
  onDronesUpdate = () => {}, // Prop ใหม่: ส่งข้อมูลโดรนทั้งหมดกลับไป
  displayedDroneId = null, // Prop ใหม่: ID ของโดรนที่กำลังแสดงผลใน side panel
  drones = [] // Prop ใหม่: รับข้อมูลโดรนจากภายนอก
}) {
  const [viewState, setViewState] = useState({
    latitude: 14.298643951839617,
    longitude: 101.16652617919162,
    zoom: 15,
    pitch: 60,
    bearing: 20,
  });
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [hoverElevation, setHoverElevation] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weatherStatus, setWeatherStatus] = useState('idle'); // idle | loading | loaded | error
  const [localTime, setLocalTime] = useState(null);
  const [isWeatherCollapsed, setIsWeatherCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fetchTimerRef = useRef(null);
  const clockTimerRef = useRef(null);
  const mapRef = useRef(null);

  const [selectedDroneId, setSelectedDroneId] = useState(null);

  // สถานะสำหรับ No-fly zone
  const [noFlyZone] = useState({
    show: true, // ตั้งค่าให้แสดงผลเป็นค่าเริ่มต้น
    radiusKm: 1.2, // รัศมีเป็นกิโลเมตร
    center: { lat: 14.298643951839617, lng: 101.16652617919162 }
  });

  // สร้างข้อมูล GeoJSON สำหรับ No-fly zone โดยใช้ useMemo เพื่อไม่ให้คำนวณใหม่ทุกครั้งที่ re-render
  const noFlyZoneGeoJSON = useMemo(() => 
    createGeoJSONCircle([noFlyZone.center.lng, noFlyZone.center.lat], noFlyZone.radiusKm),
    [noFlyZone.center.lng, noFlyZone.center.lat, noFlyZone.radiusKm]
  );

  // ดึงพยากรณ์อากาศตามจุดศูนย์กลางแผนที่ (debounce หลังการเลื่อน)
  useEffect(() => {
    if (!WEATHER_API_KEY) return;
    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current);
    }
    fetchTimerRef.current = setTimeout(async () => {
      try {
        const { latitude, longitude } = viewState;
        setWeatherStatus('loading');
        // ใช้ OpenWeather Current Weather API (ฟรี) เพื่อง่ายต่อการใช้งาน
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${WEATHER_API_KEY}&units=metric&lang=th`;
        const res = await fetch(url);
        if (!res.ok) {
          setWeather(null);
          setWeatherStatus('error');
          return;
        }
        const data = await res.json();
        const currentWeather = data?.weather?.[0];
        setWeather({
          temp: data?.main?.temp, // หน่วยตาม units=metric => °C
          desc: currentWeather?.description,
          icon: currentWeather?.icon,
          timezoneOffsetSec: data?.timezone ?? 0,
          name: data?.name || 'พิกัดปัจจุบัน',
          humidity: data?.main?.humidity,
          pressure: data?.main?.pressure,
          windSpeed: data?.wind?.speed,
          windGust: data?.wind?.gust,
          windDeg: data?.wind?.deg,
          clouds: data?.clouds?.all
        });
        setWeatherStatus('loaded');
      } catch (e) {
        setWeather(null);
        console.error('Failed to fetch weather data:', e);
        setWeatherStatus('error');
      }
    }, 400);
    return () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.latitude, viewState.longitude]);

  // อัปเดตเวลาโลคัลของจุดนั้นทุกวินาที
  useEffect(() => {
    if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    if (!weather?.timezoneOffsetSec && weather?.timezoneOffsetSec !== 0) {
      setLocalTime(null);
      return;
    }
    const updateTime = () => {
      const targetOffsetSec = weather.timezoneOffsetSec ?? 0;
      const localOffsetSec = -new Date().getTimezoneOffset() * 60; // แปลงเป็นวินาที
      const deltaMs = (targetOffsetSec - localOffsetSec) * 1000;
      const nowLocal = new Date(Date.now() + deltaMs);
      setLocalTime(nowLocal);
    };
    updateTime();
    clockTimerRef.current = setInterval(updateTime, 1000);
    return () => {
      if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    };
  }, [weather?.timezoneOffsetSec]);

  const activeDrone = selectedDroneId != null ? drones.find(d => d.id === selectedDroneId) : null;

  // เมื่อ activeDrone เปลี่ยนแปลง ให้ส่งข้อมูลกลับไปที่ App component
  useEffect(() => {
    onDroneChange(activeDrone);
  }, [activeDrone, onDroneChange]);

  // ส่งข้อมูลโดรนทั้งหมดกลับไปเมื่อมีการอัปเดต
  useEffect(() => {
    onDronesUpdate(drones);
  }, [drones, onDronesUpdate]);

  useEffect(() => {
    if (selectedDroneId != null) {
      const current = drones.find(d => d.id === selectedDroneId);
      if (!current) {
        setSelectedDroneId(null);
      }
    }
  }, [selectedDroneId, drones]);

  useEffect(() => {
    if (isFullscreen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
    return undefined;
  }, [isFullscreen]);

  useEffect(() => {
    if (mapRef.current?.resize) {
      mapRef.current.resize();
    } else if (mapRef.current?.getMap) {
      mapRef.current.getMap().resize();
    }
  }, [isFullscreen]);

  return (
    <div className={`map-container${isFullscreen ? ' map-container--fullscreen' : ''}`}>
      <button
        type="button"
        className="map-fullscreen-toggle"
        onClick={() => setIsFullscreen(prev => !prev)}
      >
        {isFullscreen ? 'ออกจากเต็มจอ' : 'ขยายเต็มจอ'}
      </button>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onMouseMove={({ lngLat, target: map }) => {
          const elevation = map?.queryTerrainElevation?.(lngLat, { exaggerated: false });
          if (typeof elevation === 'number' && isFinite(elevation)) {
            setHoverElevation({ value: elevation, lngLat });
          } else {
            setHoverElevation(null);
          }
        }}
        onMouseLeave={() => setHoverElevation(null)}
        onLoad={({ target: map }) => {
          // เพิ่ม Terrain (DEM) เพื่อให้พื้นผิวเป็น 3D
          if (!map.getSource('mapbox-dem')) {
            map.addSource('mapbox-dem', {
              type: 'raster-dem',
              url: 'mapbox://mapbox.terrain-rgb',
              tileSize: 512,
              maxzoom: 14
            });
          }
          map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

          // เพิ่มท้องฟ้าเพื่อเอฟเฟกต์ 3D ที่สมจริง
          if (!map.getLayer('sky')) {
            map.addLayer({
              id: 'sky',
              type: 'sky',
              paint: {
                'sky-type': 'atmosphere',
                'sky-atmosphere-sun': [0.0, 0.0],
                'sky-atmosphere-sun-intensity': 15
              }
            });
          }

          // เพิ่มอาคาร 3D (extrusions) แทรกใต้เลเยอร์ labels
          const layers = map.getStyle().layers;
          const labelLayerId = layers.find(
            l => l.type === 'symbol' && l.layout && l.layout['text-field']
          )?.id;

          if (!map.getLayer('3d-buildings')) {
            map.addLayer(
              {
                id: '3d-buildings',
                source: 'composite',
                'source-layer': 'building',
                filter: ['==', 'extrude', 'true'],
                type: 'fill-extrusion',
                minzoom: 15,
                paint: {
                  'fill-extrusion-color': '#aaa',
                  'fill-extrusion-height': ['get', 'height'],
                  'fill-extrusion-base': ['get', 'min_height'],
                  'fill-extrusion-opacity': 0.6
                }
              },
              labelLayerId
            );
          }
        }}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        antialias={true}
        mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
      >
      {/* โดรน 3 ตัว โคจรรอบศูนย์กลางแผนที่ */}
      {noFlyZone.show && noFlyZoneGeoJSON && (
        <Source id="no-fly-zone-source" type="geojson" data={noFlyZoneGeoJSON}>
          <Layer
            id="no-fly-zone-fill"
            type="fill"
            paint={{
              'fill-color': '#ff0000',
              'fill-opacity': 0.2
            }}
          />
          <Layer
            id="no-fly-zone-outline"
            type="line"
            paint={{
              'line-color': '#ff0000',
              'line-width': 2
            }}
          />
        </Source>
      )}
      {/* ข้อความ "No Fly Zone" ตรงกลาง */}
      {noFlyZone.show && (
        <Source
          id="nfz-label-source"
          type="geojson"
          data={{
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [noFlyZone.center.lng, noFlyZone.center.lat]
            },
            properties: {}
          }}
        >
          <Layer
            id="nfz-label-layer"
            type="symbol"
            layout={{
              'text-field': 'No Fly Zone',
              'text-size': 16, // ขนาดตัวอักษร
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-allow-overlap': true,
              'text-ignore-placement': true
            }}
            paint={{ 'text-color': '#ffffff', 'text-halo-color': '#c00', 'text-halo-width': 1.5 }} // สีขาว มีขอบสีแดง
          />
        </Source>
      )}

      {/* กล่องสภาพอากาศ + เวลา (ขวาบน) */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          padding: '8px 10px',
          borderRadius: 6,
          fontSize: 12,
          zIndex: 2,
          minWidth: 160,
          textAlign: 'left'
        }}
      >
        <div 
          style={{ 
            fontWeight: 600, 
            marginBottom: isWeatherCollapsed ? 0 : 4,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none'
          }}
          onClick={() => setIsWeatherCollapsed(!isWeatherCollapsed)}
        >
          <span>{weather?.name || 'พิกัดปัจจุบัน'}</span>
          <span style={{ fontSize: '14px', marginLeft: '8px' }}>
            {isWeatherCollapsed ? '▼' : '▲'}
          </span>
        </div>
        {!isWeatherCollapsed && (
          <>
            {weatherStatus === 'loading' && <div>กำลังโหลดข้อมูลอากาศ...</div>}
            {weatherStatus === 'error' && (
              <div style={{ color: '#ffbcbc' }}>ดึงข้อมูลอากาศไม่สำเร็จ</div>
            )}
            {weatherStatus === 'loaded' && weather && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {weather.icon && (
                    <img
                      alt="icon"
                      width="28"
                      height="28"
                      src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
                      style={{ imageRendering: 'pixelated' }}
                    />
                  )}
                  <div>
                    <div>{weather.desc || '-'}</div>
                    <div>{weather.temp != null ? `${weather.temp.toFixed(1)}°C` : '-'}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 8, rowGap: 2, marginBottom: 4 }}>
                  <div>ความชื้น</div><div>{weather.humidity != null ? `${weather.humidity}%` : '-'}</div>
                  <div>เมฆ</div><div>{weather.clouds != null ? `${weather.clouds}%` : '-'}</div>
                  <div>ลม</div><div>
                    {weather.windSpeed != null ? `${weather.windSpeed.toFixed(1)} m/s` : '-'}
                    {weather.windGust != null ? ` (กระโชก ${weather.windGust.toFixed(1)} m/s)` : ''}
                    {weather.windDeg != null ? ` ${weather.windDeg}°` : ''}
                  </div>
                </div>
                <div>
                  {localTime
                    ? `${localTime.toLocaleDateString('th-TH')} ${localTime.toLocaleTimeString('th-TH')}`
                    : '-'}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {hoverElevation && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '6px 8px',
            borderRadius: 4,
            fontSize: 12,
            zIndex: 1
          }}
        >
          <div>Lat: {hoverElevation.lngLat.lat.toFixed(6)}</div>
          <div>Lng: {hoverElevation.lngLat.lng.toFixed(6)}</div>
          ความสูง: {hoverElevation.value.toFixed(1)} m
        </div>
      )}
      

      {selectedLocation && (
        <Popup
          latitude={selectedLocation.latitude}
          longitude={selectedLocation.longitude}
          onClose={() => setSelectedLocation(null)}
          anchor="top"
          closeOnClick={false}
        >
          <div>
            <h4>{selectedLocation.name}</h4>
            <p>Lat: {selectedLocation.latitude}</p>
            <p>Lng: {selectedLocation.longitude}</p>
          </div>
        </Popup>
      )}
      </Map>
    </div>
  );
}

export default MapComponent;