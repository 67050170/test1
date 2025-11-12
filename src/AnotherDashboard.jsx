// src/AnotherDashboard.jsx

import React from 'react';
import './App.css'; // ใช้สไตล์ร่วมกัน

function AnotherDashboard({ onLogout }) {
  return (
    <div className="App">
      <header>
        <h1>🚀 Secondary Dashboard</h1>
        <button onClick={onLogout} className="logout-button">
          Logout
        </button>
      </header>
      <div style={{ padding: '40px', textAlign: 'center', fontSize: '24px', color: 'white' }}>
        <p>ยินดีต้อนรับสู่ Dashboard ที่สอง</p>
      </div>
    </div>
  );
}

export default AnotherDashboard;