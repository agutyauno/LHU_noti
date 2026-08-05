import axios from 'axios';
import { createExpressApp } from '../server';
import { connectDatabase, disconnectDatabase, prisma } from '../services/prismaService';
import { Server } from 'http';

const TEST_PORT = 3099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

async function runSimulateApiTest() {
  console.log('==================================================');
  console.log('   TESTING EXPRESS /api/simulate-message ENDPOINT  ');
  console.log('==================================================\n');

  // 1. Connect DB & Start temporary test Express server on dedicated test port
  await connectDatabase();
  await prisma.scheduleSnapshot.deleteMany({});
  await prisma.student.deleteMany({});

  const app = createExpressApp();
  const server: Server = app.listen(TEST_PORT);

  const testUser = {
    from: 'zalo_api_test_user_777',
    senderName: 'Bùi Hoài Nam',
  };

  try {
    // Test 1: GET /health
    console.log('1. Testing GET /health ...');
    const healthRes = await axios.get(`${BASE_URL}/health`);
    console.log('   Status:', healthRes.status);
    console.log('   Service:', healthRes.data.service);
    console.log('   DB Status:', healthRes.data.database.status);
    console.log('   ✅ GET /health PASS!\n');

    // Test 2: POST /api/simulate-message (/help)
    console.log('2. Testing POST /api/simulate-message ("/help") ...');
    const helpRes = await axios.post(`${BASE_URL}/api/simulate-message`, {
      ...testUser,
      body: '/help',
    });
    console.log('   Response Message:\n', helpRes.data.responseMessage);
    console.log('   ✅ /help test PASS!\n');

    // Test 3: POST /api/simulate-message (/dangky 121000123)
    console.log('3. Testing POST /api/simulate-message ("/dangky 121000123") ...');
    const regRes = await axios.post(`${BASE_URL}/api/simulate-message`, {
      ...testUser,
      body: '/dangky 121000123',
    });
    console.log('   Response Message:\n', regRes.data.responseMessage);
    console.log('   ✅ /dangky test PASS!\n');

    // Test 4: POST /api/simulate-message ("OK")
    console.log('4. Testing POST /api/simulate-message ("OK") ...');
    const okRes = await axios.post(`${BASE_URL}/api/simulate-message`, {
      ...testUser,
      body: 'OK',
    });
    console.log('   Response Message:\n', okRes.data.responseMessage);
    console.log('   ✅ OK confirmation test PASS!\n');

    // Test 5: POST /api/simulate-message ("/trangthai")
    console.log('5. Testing POST /api/simulate-message ("/trangthai") ...');
    const statusRes = await axios.post(`${BASE_URL}/api/simulate-message`, {
      ...testUser,
      body: '/trangthai',
    });
    console.log('   Response Message:\n', statusRes.data.responseMessage);
    console.log('   ✅ /trangthai test PASS!\n');

    // Test 6: POST /api/simulate-message ("/homnay")
    console.log('6. Testing POST /api/simulate-message ("/homnay") ...');
    const todayRes = await axios.post(`${BASE_URL}/api/simulate-message`, {
      ...testUser,
      body: '/homnay',
    });
    console.log('   Response Message:\n', todayRes.data.responseMessage);
    console.log('   ✅ /homnay test PASS!\n');

    console.log('🎉 TOÀN BỘ BÀI TEST API /api/simulate-message ĐÃ THÀNH CÔNG! 🎉');
  } catch (err: any) {
    console.error('❌ API Test Failed:', err.response?.data || err.message);
  } finally {
    // Cleanup
    await prisma.scheduleSnapshot.deleteMany({});
    await prisma.student.deleteMany({});
    await disconnectDatabase();
    server.close();
    process.exit(0);
  }
}

runSimulateApiTest();
