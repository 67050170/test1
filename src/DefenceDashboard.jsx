// src/DefenceDashboard.jsx

import React, { useCallback, useState, useReducer, useEffect } from 'react';
import { io } from 'socket.io-client'; // Import socket.io-client
import MapComponent from './MapComponent';
import './App.css';

// สร้าง Reducer เพื่อจัดการ State ที่ซับซ้อน
const droneStateReducer = (state, action) => {
  switch (action.type) {
    case 'UPDATE_ALL_DRONES':
      const visibleDrones = action.payload.filter(d => d.visible);
      // หากโดรنที่แสดงอยู่หายไป ให้เลือกตัวแรกที่มองเห็นได้แทน
      const newDisplayedId = state.displayedDroneId && visibleDrones.some(d => d.id === state.displayedDroneId)
        ? state.displayedDroneId
        : visibleDrones[0]?.id || null;
      return { ...state, allDrones: action.payload, displayedDroneId: newDisplayedId };
    case 'SET_CLICKED_DRONE':
      return { ...state, displayedDroneId: action.payload?.id || state.displayedDroneId };
    case 'CYCLE_DRONE':
      const currentVisible = state.allDrones.filter(d => d.visible);
      if (currentVisible.length === 0) return state;
      const currentIndex = currentVisible.findIndex(d => d.id === state.displayedDroneId);
      const nextIndex = (currentIndex + action.payload.direction + currentVisible.length) % currentVisible.length;
      return { ...state, displayedDroneId: currentVisible[nextIndex].id };
    default:
      return state;
  }
};

// Custom Hook for Socket.IO connection
const useSocket = (camId, enabled) => {
  const [realtimeData, setRealtimeData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !camId) return;

    // Connect to the Socket.IO server
    // Make sure VITE_SOCKET_URL is defined in your .env file (e.g., VITE_SOCKET_URL=http://localhost:3001)
    const socketInstance = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001');

    socketInstance.on('connect', () => {
      console.log('✅ Socket connected');
      setIsConnected(true);
      // Subscribe to real-time data for the specific camera
      socketInstance.emit('subscribe_camera', { cam_id: camId });
    });

    socketInstance.on('object_detection', (data) => {
      console.log('Received real-time data:', data);
      setRealtimeData(data);
    });

    socketInstance.on('disconnect', () => {
      console.log('❌ Socket disconnected');
      setIsConnected(false);
    });

    // Disconnect on cleanup
    return () => socketInstance.disconnect();
  }, [camId, enabled]);

  return { realtimeData, isConnected };
};

function DefenceDashboard({ onLogout }) {
  const [logMessages, setLogMessages] = useState([]);
  const [dronesInNFZ, setDronesInNFZ] = useState([]); // State ใหม่: เก็บ ID ของโดรนที่อยู่ในพื้นที่หวงห้าม
  const [isImagePopupVisible, setIsImagePopupVisible] = useState(false); // State สำหรับควบคุม Pop-up รูปภาพ
  const [popupDrone, setPopupDrone] = useState(null); // State ใหม่: เก็บข้อมูลโดรนสำหรับแสดงใน Pop-up รูปภาพ

  // ฟังก์ชันสำหรับเพิ่ม Log ใหม่
  const addLogMessage = useCallback((message) => {
    const newLog = {
      id: Date.now() + Math.random(), // ID สำหรับ key
      timestamp: new Date(),
      message: message,
    };
    // เพิ่ม Log ใหม่เข้าไปด้านบนสุด และเก็บไว้สูงสุด 50 รายการ
    setLogMessages(prevLogs => [newLog, ...prevLogs].slice(0, 50));
  }, []);

  // เมื่อโดรนเข้าพื้นที่: เพิ่ม ID เข้าไปใน Array
  const handleEnterNFZ = useCallback((drone) => {
    setDronesInNFZ(prev => {
      if (!prev.includes(drone.id)) { // ป้องกันการเพิ่มซ้ำ
        addLogMessage(`🚨 คำเตือน: วัตถุ ID: ${drone.id} เข้าสู่พื้นที่หวงห้าม!`);
        return [...prev, drone.id];
      }
      return prev;
    });
  }, [addLogMessage]); // เพิ่ม addLogMessage ใน dependency array

  // เมื่อโดรนออกจากพื้นที่: เอา ID ออกจาก Array
  const handleExitNFZ = useCallback((drone) => {
    addLogMessage(`✅ วัตถุ ID: ${drone.id} ออกจากพื้นที่หวงห้าม`);
    setDronesInNFZ(prev => prev.filter(id => id !== drone.id));
  }, [addLogMessage]);

  // ใช้ useReducer จัดการ State ของโดรน
  const [droneState, dispatchDroneState] = useReducer(droneStateReducer, {
    allDrones: [],
    displayedDroneId: null,
  });
  const { allDrones, displayedDroneId } = droneState;

  // --- Real-time Data Integration ---
  // This is the camera ID for the defence dashboard
  const camId = '228594f4-edca-4027-9f8e-54c995240bc5'; 
  const { realtimeData } = useSocket(camId, true);

  // When new real-time data arrives, add it to the log
  useEffect(() => {
    if (realtimeData) {
      addLogMessage(`📡 [REAL-TIME] AI detected object. Camera: ${realtimeData.camera_id}`);
      // Here you would typically update your drone/object state with the new data.
      // For this example, we'll just log it. In a real app, you might do:
      // dispatchDroneState({ type: 'UPDATE_FROM_AI', payload: realtimeData });
    }
  }, [realtimeData, addLogMessage]);

  // รับข้อมูลโดรนทั้งหมดจาก MapComponent
  const handleDronesUpdate = useCallback((drones) => {
    dispatchDroneState({ type: 'UPDATE_ALL_DRONES', payload: drones });
  }, []);

  // หาข้อมูลโดรนที่กำลังแสดงผล
  const displayedDrone = allDrones.find(d => d.id === displayedDroneId);

  const handleCycleDrone = (direction) => {
    const dir = direction === 'next' ? 1 : -1;
    dispatchDroneState({ type: 'CYCLE_DRONE', payload: { direction: dir } });
  };

  const handleImageClick = (drone) => {
    setPopupDrone(drone);
    setIsImagePopupVisible(true);
  };

  return (
    <div className="App">
      <header>
        <h1>🛡️ Defence Dashboard</h1>
        <button onClick={onLogout} className="logout-button">
          Logout
        </button>
      </header>

      <div className="dashboard-layout">
        <div className="map-panel">
          <MapComponent 
            onDroneChange={(drone) => dispatchDroneState({ type: 'SET_CLICKED_DRONE', payload: drone })}
            onLog={addLogMessage} 
            onEnterNoFlyZone={handleEnterNFZ}
            onExitNoFlyZone={handleExitNFZ}
            onDronesUpdate={handleDronesUpdate}
            displayedDroneId={displayedDroneId} />
        </div>
        <div className="side-panel">
          {/* แสดง Pop-up แจ้งเตือนแบบกระพริบเมื่อมีโดรนอยู่ในพื้นที่ */}
          {dronesInNFZ.length > 0 && (
            <div className="persistent-alert-container">
              <div className="persistent-alert">
                <div className="alert-title">🚨 พื้นที่หวงห้ามถูกบุกรุก</div>
                <div className="alert-body">
                  ตรวจพบวัตถุ ID: {dronesInNFZ.join(', ')}
                </div>
              </div>
            </div>
          )}

          <div className="info-box" style={{ display: 'flex', flexDirection: 'column', color: '#000' }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '18px', flexShrink: 0, color: '#000' }}>
              บันทึกเหตุการณ์
            </h3>
            <div style={{ flexGrow: 1, overflowY: 'auto', fontSize: '13px', fontFamily: 'monospace' }}>
              {logMessages.length > 0 ? (
                logMessages.map(log => (
                  <div key={log.id} style={{ marginBottom: '6px', borderBottom: '1px solid #e0e0e0', paddingBottom: '4px', color: '#000' }}>
                    <span style={{ color: '#888' }}>[{log.timestamp.toLocaleTimeString('th-TH')}]</span> {log.message}
                  </div>
                ))
              ) : (
                <div style={{ color: '#000', textAlign: 'center', paddingTop: '20px' }}>
                  ยังไม่มีเหตุการณ์...
                </div>
              )}
            </div>
          </div>
          <div className="info-box" style={{ textAlign: 'center', padding: '24px' }}>
            {displayedDrone ? (
              <>
                <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', color: '#000' }}>
                  รายละเอียดวัตถุที่ {displayedDrone.id}
                </h3>
                <div style={{ padding: '16px', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', marginBottom: '16px' }}>
                  <img
                    src={`/${displayedDrone.size}.png`}
                    onClick={() => handleImageClick(displayedDrone)}
                    alt={`โดรน ${displayedDrone.id}`}
                    style={{ width: '100%', maxWidth: '150px', height: 'auto', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))', cursor: 'pointer' }}
                  />
                </div>
                <div style={{ fontSize: '14px', textAlign: 'left', background: '#f9f9f9', padding: '12px', borderRadius: '6px', color: '#000' }}>
                  <div><strong>ID:</strong> {displayedDrone.id}</div>
                  <div><strong>ขนาด:</strong> {displayedDrone.size} ({displayedDrone.sizePx}px)</div>
                  <div><strong>พิกัด:</strong> {displayedDrone.lat.toFixed(4)}, {displayedDrone.lng.toFixed(4)}</div>
                </div>
                {allDrones.filter(d => d.visible).length > 1 && (
                  <div className="drone-cycle-controls">
                    <button onClick={() => handleCycleDrone('prev')}>
                      &lt; ก่อนหน้า
                    </button>
                    <button onClick={() => handleCycleDrone('next')}>
                      ถัดไป &gt;
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <p>คลิกที่วัตถุบนแผนที่เพื่อดูรายละเอียด</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pop-up แสดงรูปภาพขนาดใหญ่ */}
      {isImagePopupVisible && popupDrone && (
        <div className="drone-modal-backdrop" onClick={() => setIsImagePopupVisible(false)}>
          <div className="drone-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '80vw', maxHeight: '80vh', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button className="drone-modal-close-button" onClick={() => setIsImagePopupVisible(false)}>
              &times;
            </button>
            <img
              src={`/${popupDrone.size}.png`}
              alt={`โดรน ${popupDrone.id}`}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default DefenceDashboard;