import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { TikTokLive } from '@tiktool/live';
import { WebSocketServer, WebSocket } from 'ws';

const TIKTOK_ROOMS = ['iamturle2106', 'username_phong_thu_2'];
const TIKTOOLS_API_KEY = 'tk_ac7b38220aef7fe69dfe7e1ac72c18df7b564dc52ceec33c';
const TIKTOOLS_MODE = 'direct';

const BOT_ENABLED = true;
const BOT_INTERVAL_MS = 15000;

const PORT = 8080;
const PROJECT_DIR = import.meta.dirname || path.dirname(new URL(import.meta.url).pathname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(PROJECT_DIR, '.' + pathname);
  if (!file.startsWith(PROJECT_DIR + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Không tìm thấy ' + pathname);
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  console.log('[WS] Frontend đã kết nối');
  socket.send(JSON.stringify({ type: 'system', message: 'connected' }));
  socket.on('close', () => console.log('[WS] Frontend ngắt kết nối'));
});

server.listen(PORT, () => {
  console.log(`[HTTP] Game đang chạy tại http://localhost:${PORT} (mở bằng trình duyệt hoặc OBS Browser Source)`);
});

function broadcast(payload) {
  const json = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  }
}

function classifyGift(data) {
  const id = Number(data.giftId);
  if (id === 5608 || id === 5267) return 'rose';
  if (id === 5827 || id === 5585) return 'heart_gift';
  if (id === 5656 || id === 5617) return 'medium_gift';
  const diamonds = Number(data.diamondCount) || 0;
  if (diamonds >= 100) return 'mega_gift';
  if (diamonds >= 10) return 'large_gift';
  if (diamonds >= 1) return 'small_gift';
  return 'small_gift';
}

function startRoom(username) {
  const conn = new TikTokLive({
    uniqueId: username,
    apiKey: TIKTOOLS_API_KEY,
    mode: TIKTOOLS_MODE,
    autoReconnect: true,
  });

  conn.on('chat', (data) => {
    const playerName = data.user?.uniqueId || 'khách';
    broadcast({ type: 'chat', playerName });
    console.log(`[Chat @${username}] @${playerName}: ${data.comment}`);
  });

  conn.on('gift', (data) => {
    const giftType = Number(data.giftType);
    if (giftType === 1 && !data.repeatEnd) return;

    const count = Math.max(1, Number(data.repeatCount) || 1);
    const type = classifyGift(data);
    const playerName = data.user?.uniqueId || 'khách';

    console.log(`[Gift @${username}] @${playerName} tặng ${data.giftName} (ID=${data.giftId}, ${data.diamondCount} xu) x${count} -> ${type}`);
    for (let i = 0; i < count; i++) {
      broadcast({ type, playerName, giftName: data.giftName, repeatCount: count, room: username });
    }
  });

  async function connectWithRetry() {
    try {
      await conn.connect();
      console.log(`[TikTok] Đã kết nối tới live room @${username}`);
    } catch (err) {
      console.error(`[TikTok] @${username} kết nối thất bại (${err?.message || err}). Thử lại sau 30 giây...`);
      setTimeout(connectWithRetry, 30000);
    }
  }

  connectWithRetry();
}

TIKTOK_ROOMS.forEach((room) => startRoom(room.trim()));

if (BOT_ENABLED) {
  setInterval(() => {
    broadcast({ type: 'bot', playerName: 'BOT 🤖' });
    console.log('[BOT] Thả bóng tự động');
  }, BOT_INTERVAL_MS);
}
