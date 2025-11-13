// src/DefenceDashboard.jsx

import React, { useCallback, useState, useReducer, useEffect } from 'react';
import { io } from 'socket.io-client'; // Import socket.io-client
import MapComponent from './MapComponent';
import './App.css';

const getDroneInfoImageUrl = (size) => {
  switch (size) {
    case 'small':
      return '/small.png';
    case 'medium':
      return '/medium.png';
    case 'large':
      return '/large.png';
    default:
      return '/Drone.png';
  }
};
// สร้าง Reducer เพื่อจัดการ State ที่ซับซ้อน
const droneStateReducer = (state, action) => {
  switch (action.type) {
    case 'UPDATE_FROM_AI': {
      const aiData = action.payload;
      // สมมติว่าข้อมูลที่ได้จาก AI มีโครงสร้าง { id, lat, lng, size, ... }
      // และเราจะอัปเดตหรือเพิ่มโดรนใหม่เข้าไปใน state
      const existingDroneIndex = state.allDrones.findIndex(d => d.id === aiData.id);
      const droneWithImages = { 
        ...aiData, 
        mapIconUrl: '/Drone.png', // Generic icon for the map
        imageUrl: getDroneInfoImageUrl(aiData.size) // Specific image for the info panel
      };
      let newDrones = [...state.allDrones];

      if (existingDroneIndex !== -1) {
        // อัปเดตโดรนที่มีอยู่แล้ว
        newDrones[existingDroneIndex] = { ...newDrones[existingDroneIndex], ...droneWithImages, visible: true, lastSeen: Date.now() };
      } else {
        // เพิ่มโดรนใหม่
        newDrones.push({ ...droneWithImages, visible: true, lastSeen: Date.now() });
      }

      // ส่ง state ที่อัปเดตแล้วกลับไป
      return {
        ...state,
        allDrones: newDrones,
        displayedDroneId: aiData.id, // Automatically display the new/updated drone
      };
    }
    case 'SET_CLICKED_DRONE':
      return { ...state, displayedDroneId: action.payload?.id || state.displayedDroneId };
    case 'CYCLE_DRONE': {
      const currentVisible = state.allDrones.filter(d => d.visible);
      if (currentVisible.length === 0) return state;
      const currentIndex = currentVisible.findIndex(d => d.id === state.displayedDroneId);
      const nextIndex = (currentIndex + action.payload.direction + currentVisible.length) % currentVisible.length;
      return { ...state, displayedDroneId: currentVisible[nextIndex].id };
    }
    case 'HIDE_OLD_DRONES': {
        const now = Date.now();
        const newDrones = state.allDrones.map(drone => ({
            ...drone,
            visible: (now - drone.lastSeen) < action.payload.timeout,
        }));
        const displayedDroneIsVisible = newDrones.some(d => d.id === state.displayedDroneId && d.visible);
        const newDisplayedId = displayedDroneIsVisible ? state.displayedDroneId : newDrones.find(d => d.visible)?.id || null;
        return { ...state, allDrones: newDrones, displayedDroneId: newDisplayedId };
    }
    case 'UPDATE_DRONE_NFZ_STATUS': {
      const { droneId, isInNFZ } = action.payload;
      const droneIndex = state.allDrones.findIndex(d => d.id === droneId);
      if (droneIndex === -1) return state;

      const newDrones = [...state.allDrones];
      const updatedDrone = { ...newDrones[droneIndex], isInNFZ };
      newDrones[droneIndex] = updatedDrone;

      return {
        ...state,
        allDrones: newDrones,
      };
    }
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
    const socketInstance = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5174');

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
        dispatchDroneState({ type: 'UPDATE_DRONE_NFZ_STATUS', payload: { droneId: drone.id, isInNFZ: true } });
        addLogMessage(`🚨 คำเตือน: วัตถุ ID: ${drone.id} เข้าสู่พื้นที่หวงห้าม!`);
        return [...prev, drone.id];
      }
      return prev;
    });
  }, [addLogMessage]); // เพิ่ม addLogMessage ใน dependency array

  // เมื่อโดรนออกจากพื้นที่: เอา ID ออกจาก Array
  const handleExitNFZ = useCallback((drone) => {
    addLogMessage(`✅ วัตถุ ID: ${drone.id} ออกจากพื้นที่หวงห้าม`);
    dispatchDroneState({ type: 'UPDATE_DRONE_NFZ_STATUS', payload: { droneId: drone.id, isInNFZ: false } });
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
  const camId = 'a93479da-d106-481d-941c-dc1184fa69cc';
  // Always use the real socket connection
  const { realtimeData } = useSocket(camId, true);

  // When new real-time data arrives, add it to the log
  useEffect(() => {
    if (realtimeData) {
      addLogMessage(`📡 [REAL-TIME] AI detected object. Camera: ${realtimeData.camera_id}`);
      // อัปเดต state ของโดรนด้วยข้อมูลที่ได้รับจาก AI
      // The payload from /api/ai-data is the drone data itself.
      if (realtimeData.id) {
        dispatchDroneState({ type: 'UPDATE_FROM_AI', payload: realtimeData });
      }
    }
  }, [realtimeData, addLogMessage]);

  // Effect สำหรับซ่อนโดรนที่ขาดการติดต่อ
  useEffect(() => {
    const interval = setInterval(() => {
      dispatchDroneState({ type: 'HIDE_OLD_DRONES', payload: { timeout: 10000 } }); // 10 วินาที
    }, 2000); // เช็คทุก 2 วินาที

    return () => clearInterval(interval);
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
            drones={allDrones}
            onDroneChange={(drone) => dispatchDroneState({ type: 'SET_CLICKED_DRONE', payload: drone })}
            onLog={addLogMessage} 
            onEnterNoFlyZone={handleEnterNFZ}
            onExitNoFlyZone={handleExitNFZ}
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
                    src={displayedDrone.imageUrl || "/Drone.png"}
                    onClick={() => handleImageClick(displayedDrone)}
                    alt={`โดรน ${displayedDrone.id}`}
                    style={{ width: '100%', maxWidth: '150px', height: 'auto', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))', cursor: 'pointer' }}
                  />
                </div>
                <div style={{ fontSize: '14px', textAlign: 'left', background: '#f9f9f9', padding: '12px', borderRadius: '6px', color: '#000' }}>
                  <div><strong>ID:</strong> {displayedDrone.id}</div>
                  <div><strong>ขนาด:</strong> {displayedDrone.size}</div>
                  <div><strong>พิกัด:</strong> {displayedDrone.lat.toFixed(4)}, {displayedDrone.lng.toFixed(4)}</div>
                  <div><strong>ความสูง:</strong> {displayedDrone.alt ? `${displayedDrone.alt.toFixed(1)} m` : 'N/A'}</div>
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
              src={popupDrone.imageUrl || "/Drone.png"}
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