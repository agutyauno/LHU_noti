import dotenv from 'dotenv';
import axios from 'axios';
import { log } from 'node:console';

dotenv.config();

const BOT_TOKEN = process.env.ZALO_BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('Lỗi: Chưa tìm thấy ZALO_BOT_TOKEN trong file .env');
    process.exit(1);
}

// Endpoint chuẩn của Zalo Bot API (Domain: bot-api.zapps.me, Method: /getMe)
const entrypoint = `https://bot-api.zapps.me/bot${BOT_TOKEN}/getMe`;

try {
    const response = await axios.post(entrypoint);
    console.log('Phản hồi từ Zalo API:');
    console.log(response.data);
} catch (error) {
    if (error.response) {
        console.error('Lỗi API (Status Code):', error.response.status);
        console.error('Dữ liệu lỗi:', error.response.data);
    } else {
        console.error('Lỗi kết nối:', error.message);
    }
}

const entrypoint2 = `https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}/getUpdates`;
const response2 = await axios.post(entrypoint2, {
    timeout: 30
});
console.log(response2);