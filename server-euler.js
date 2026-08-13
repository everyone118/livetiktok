import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import { WebSocketServer, WebSocket } from 'ws';
import { writeFile } from 'node:fs/promises';

const TIKTOK_USERNAME = 'iamturle2106';

const WS_PORT = 8080;
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (socket) => {
  console.log('[WS] Frontend đã kết nối');
  socket.send(JSON.stringify({ type: 'system', message: 'connected' }));
  socket.on('close', () => console.log('[WS] Frontend ngắt kết nối'));
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
  const diamonds =
    Number(data.gift?.diamondCount) ||
    Number(data.extendedGiftInfo?.diamondCost) ||
    Number(data.diamondCount) ||
    0;
  if (diamonds >= 100) return 'mega_gift';
  if (diamonds >= 10) return 'large_gift';
  if (diamonds >= 1) return 'small_gift';
  return 'small_gift';
}

function giftDiamondCount(giftRecord) {
  return (
    Number(giftRecord?.diamondCount) ||
    Number(giftRecord?.diamondCost) ||
    Number(giftRecord?.diamond_cost) ||
    0
  );
}

async function printGiftList() {
  const list = tiktokConnection.availableGifts;
  if (!Array.isArray(list) || list.length === 0) {
    console.log('[GiftList] Không lấy được danh sách quà.');
    return;
  }
  const rows = list
    .map((g) => ({
      id: String(g.id ?? g.giftId ?? g.gift_id ?? '?'),
      name: String(g.name ?? g.giftName ?? '?'),
      diamonds: giftDiamondCount(g),
    }))
    .sort((a, b) => a.diamonds - b.diamonds);
  console.log(`[GiftList] Đã quét ${rows.length} món quà của room (ID | Tên | Giá xu):`);
  for (const r of rows) {
    console.log(`  ${r.id}  ${r.name}  (${r.diamonds} xu)`);
  }
  try {
    await writeFile('gift-list.json', JSON.stringify(rows, null, 2), 'utf8');
    console.log('[GiftList] Đã lưu vào gift-list.json');
  } catch (err) {
    console.warn('[GiftList] Không lưu được file:', err.message);
  }
}

const tiktokConnection = new TikTokLiveConnection(TIKTOK_USERNAME, {
  enableExtendedGiftInfo: true,
});

async function connectWithRetry() {
  if (tiktokConnection.state.isConnected || tiktokConnection.state.isConnecting) return;
  try {
    const state = await tiktokConnection.connect();
    console.log(`[TikTok] Đã kết nối tới live room @${TIKTOK_USERNAME} (roomId: ${state.roomId})`);
    printGiftList();
  } catch (err) {
    console.error(`[TikTok] Kết nối thất bại (${err?.message || err}). Thử lại sau 30 giây...`);
  }
}

tiktokConnection.on(WebcastEvent.CHAT, (data) => {
  const playerName = data.user?.uniqueId || 'khách';
  broadcast({ type: 'chat', playerName });
  console.log(`[Chat] @${playerName}: ${data.comment}`);
});

tiktokConnection.on(WebcastEvent.GIFT, (data) => {
  const giftType = Number(data.gift?.type);
  if (giftType === 1 && !data.repeatEnd) return;

  const count = Math.max(1, Number(data.repeatCount) || 1);
  const type = classifyGift(data);
  const giftName = data.gift?.name || data.extendedGiftInfo?.name || String(data.giftId);
  const diamonds =
    Number(data.gift?.diamondCount) ||
    Number(data.extendedGiftInfo?.diamondCost) ||
    Number(data.diamondCount) ||
    0;
  const playerName = data.user?.uniqueId || 'khách';

  console.log(`[Gift] @${playerName} tặng ${giftName} (ID=${data.giftId}, ${diamonds} xu) x${count} -> ${type}`);
  for (let i = 0; i < count; i++) {
    broadcast({ type, playerName, giftName, repeatCount: count });
  }
});

connectWithRetry();

setInterval(connectWithRetry, 30000);
