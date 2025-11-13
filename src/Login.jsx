// src/Login.jsx

import React, { useState } from 'react';
import './Login.css';
// Note: The USERS object is now removed from the client, as the server will handle authentication.

function Login({ onLoginSuccess }) {
  // Default to the defence user for easier testing
  const [cameraId, setCameraId] = useState('a93479da-d106-481d-941c-dc1184fa69cc');
  const [token, setToken] = useState('8af2ad37-da96-455e-880f-1778bfd6658d');
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
        <h1 className="login-title">TEAM SuperNova</h1>
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