// server.js

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path'; // 1. Import path
import { fileURLToPath } from 'url'; // 2. Import url helpers
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

// --- Express & Socket.IO Setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity
  }
});
app.use(cors());
app.use(express.json());

// --- Static File Serving Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Serve the built frontend files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// 3. อ่านค่า Secret Token จาก environment variable
const SECRET_TOKEN_AI = process.env.SECRET_TOKEN_AI;

// ข้อมูลผู้ใช้สำหรับล็อกอิน (ย้ายมาจาก Frontend)
const USERS = {
  'a8dd6071-9a67-49f6-abdf-e97239e46e13': {
    token: '7d705f67-47e6-479c-972b-5d0d37784bcd',
    dashboard: 'offence' // offence dashboard
  },
  '228594f4-edca-4027-9f8e-54c995240bc5': {
    token: '8aaea353-fca3-45dc-93f2-213e7a798980',
    dashboard: 'defence' // defence dashboard
  }
};

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
  console.log('🔌 A client connected to Socket.IO');

  // Handle camera subscription
  socket.on('subscribe_camera', (data) => {
    if (data && data.cam_id) {
      console.log(`📡 Client subscribed to camera: ${data.cam_id}`);
      socket.join(data.cam_id); // Join a room based on camera ID
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 A client disconnected');
  });
});

// --- API Routes ---

// Route สำหรับรับข้อมูลจาก AI
app.post('/api/ai-data', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.split(' ')[1] 
    : null;

  if (!token || token !== SECRET_TOKEN_AI) {
    return res.status(403).json({ message: 'Token ไม่ถูกต้อง' });
  }

  try {
    const { camera_id, other_data } = req.body;
    console.log('ได้รับข้อมูลจาก AI:');
    console.log('  Camera ID:', camera_id);
    if (other_data) {
      console.log('  Other Data:', other_data);
    }

    // 5. Broadcast the new data to the specific camera room
    io.to(camera_id).emit('object_detection', { camera_id, other_data, timestamp: new Date() });

    res.status(200).json({ message: 'ได้รับข้อมูลเรียบร้อย' });
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการประมวลผลข้อมูล:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายใน Server' });
  }
});

// Route สำหรับตรวจสอบการล็อกอิน
app.post('/api/login', (req, res) => {
  const { cameraId, token } = req.body;

  if (!cameraId || !token) {
    return res.status(400).json({ message: 'กรุณากรอก Camera ID และ Token' });
  }

  const user = USERS[cameraId];
  if (user && user.token === token) {
    // Login สำเร็จ: ส่งประเภทของ dashboard กลับไป
    res.status(200).json({ message: 'Login สำเร็จ', dashboard: user.dashboard });
  } else {
    // Login ไม่สำเร็จ
    res.status(401).json({ message: 'Camera ID หรือ Token ไม่ถูกต้อง' });
  }
});

// --- Catch-all route to serve index.html for client-side routing ---
app.get(/^(?!\/api).*/, (req, res) => {
  // For any request that doesn't match an API route, send the main HTML file.
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- Server Start ---

// 6. Start the server using the http instance
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server กำลังทำงานอยู่ที่ http://localhost:${PORT}`);
});
