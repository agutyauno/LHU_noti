import { handleIncomingZaloMessage, processZaloWebhookUpdate, initZaloBot } from '../services/zaloBotService';
import { connectDatabase, disconnectDatabase } from '../services/prismaService';

async function runSimulation() {
  console.log('==================================================');
  console.log('     GIẢ LẬP TƯƠNG TÁC ZALO BOT SINH VIÊN LHU    ');
  console.log('==================================================\n');

  await connectDatabase();
  await initZaloBot();

  const userId = 'zalo_user_demo_888';
  const userName = 'Bùi Hoài Nam';

  // 1. Send /help
  console.log('👉 [1] Giả lập tin nhắn text: "/help"');
  let reply = await handleIncomingZaloMessage({ from: userId, senderName: userName, body: '/help' });
  console.log('🤖 Bot phản hồi:\n', reply, '\n--------------------------------------------------\n');

  // 2. Send /dangky 121000123
  console.log('👉 [2] Giả lập tin nhắn text: "/dangky 121000123"');
  reply = await handleIncomingZaloMessage({ from: userId, senderName: userName, body: '/dangky 121000123' });
  console.log('🤖 Bot phản hồi:\n', reply, '\n--------------------------------------------------\n');

  // 3. Send OK
  console.log('👉 [3] Giả lập tin nhắn text: "OK"');
  reply = await handleIncomingZaloMessage({ from: userId, senderName: userName, body: 'OK' });
  console.log('🤖 Bot phản hồi:\n', reply, '\n--------------------------------------------------\n');

  // 4. Send /trangthai
  console.log('👉 [4] Giả lập tin nhắn text: "/trangthai"');
  reply = await handleIncomingZaloMessage({ from: userId, senderName: userName, body: '/trangthai' });
  console.log('🤖 Bot phản hồi:\n', reply, '\n--------------------------------------------------\n');

  // 5. Send raw Zalo Webhook JSON payload
  console.log('👉 [5] Giả lập chuỗi JSON Zalo Webhook lồng nhau thực tế:');
  const rawZaloPayload = {
    "ok": true,
    "result": {
      "message": {
        "from": {
          "id": "6ede9afa66b88fe6d6a9",
          "display_name": "Ted",
          "is_bot": false
        },
        "chat": {
          "id": "6ede9afa66b88fe6d6a9",
          "chat_type": "PRIVATE"
        },
        "text": "/help",
        "message_id": "2d758cb5e222177a4e35",
        "date": 1750316131602
      },
      "event_name": "message.text.received"
    }
  };

  await processZaloWebhookUpdate(rawZaloPayload);
  console.log('   ✅ Đã bóc tách và xử lý Webhook payload thành công!\n--------------------------------------------------\n');

  await disconnectDatabase();
}

runSimulation().catch(console.error);
