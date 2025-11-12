// src/App.jsx

import React, { useState } from 'react';
import Login from './Login';
import DefenceDashboard from './DefenceDashboard';
import AnotherDashboard from './AnotherDashboard';
import './App.css';
import './Login.css';

function App() {
  // สถานะจะเก็บประเภทของ dashboard ที่จะแสดง: null, 'defence', 'secondary'
  const [dashboardType, setDashboardType] = useState(null);

  const handleLogout = () => {
    setDashboardType(null);
  };

  // ฟังก์ชันสำหรับจัดการการ Login
  const handleLoginSuccess = (type) => {
    setDashboardType(type);
  };

  if (dashboardType === 'defence') {
    return <DefenceDashboard onLogout={handleLogout} />;
  }
  if (dashboardType === 'secondary') {
    return <AnotherDashboard onLogout={handleLogout} />;
  }

  // ถ้ายังไม่ login ให้แสดงหน้า Login
  return <Login onLoginSuccess={handleLoginSuccess} />;
}

export default App;