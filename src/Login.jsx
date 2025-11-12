// src/Login.jsx

import React, { useState } from 'react';
import './Login.css';
// Note: The USERS object is now removed from the client, as the server will handle authentication.

function Login({ onLoginSuccess }) {
  // Default to the defence user for easier testing
  const [cameraId, setCameraId] = useState('228594f4-edca-4027-9f8e-54c995240bc5');
  const [token, setToken] = useState('8aaea353-fca3-45dc-93f2-213e7a798980');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault(); // ป้องกันการรีโหลดหน้า
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cameraId, token }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      setError('');
      onLoginSuccess(data.dashboard); // Call onLoginSuccess with the dashboard type from the API
    } catch (err) {
      setError(err.message || 'Camera ID หรือ Token ไม่ถูกต้อง');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-title">TEAM HyperNova</h1>
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label htmlFor="camera-id">Camera ID</label>
            <input
              type="text"
              id="camera-id"
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="token">Token</label>
            <input
              type="password"
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;