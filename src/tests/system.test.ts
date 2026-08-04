import assert from 'assert';
import { test, describe, before, after } from 'node:test';
import { computeScheduleDiff, ScheduleDiffChange } from '../services/diffService';
import { LHUScheduleItem } from '../services/lhuService';
import {
  formatDailyScheduleMessage,
  formatWeeklyScheduleMessage,
  formatUrgentDiffAlertMessage,
} from '../services/notificationService';
import { messageQueue } from '../services/queueService';
import { handleIncomingZaloMessage } from '../services/zaloBotService';
import { connectDatabase, disconnectDatabase, prisma } from '../services/prismaService';

describe('LHU Schedule Zalo Notifier System Tests', () => {
  before(async () => {
    await connectDatabase();
    // Clean up test data
    await prisma.scheduleSnapshot.deleteMany({});
    await prisma.student.deleteMany({});
  });

  after(async () => {
    await prisma.scheduleSnapshot.deleteMany({});
    await prisma.student.deleteMany({});
    await disconnectDatabase();
  });

  describe('1. Diff Engine Safeguard & Change Detection', () => {
    const baseSchedule: LHUScheduleItem[] = [
      {
        ID: 101,
        NhomID: 100083357,
        ThoiGianBD: '2026-03-02T12:50:00',
        ThoiGianKT: '2026-03-02T16:45:00',
        TenPhong: 'C403_PM06',
        TenNhom: '[23CT113]',
        TenMonHoc: 'Lập trình Python cho máy học',
        GiaoVien: 'Đoàn Thiện Minh',
        TenCoSo: 'Cơ sở I',
      },
    ];

    test('should detect ROOM_CHANGED', () => {
      const updatedSchedule: LHUScheduleItem[] = [
        {
          ...baseSchedule[0],
          TenPhong: 'C404_PM07',
        },
      ];
      const diffs = computeScheduleDiff(baseSchedule, updatedSchedule);
      assert.strictEqual(diffs.length, 1);
      assert.strictEqual(diffs[0].type, 'ROOM_CHANGED');
      assert.ok(diffs[0].description.includes('C404_PM07'));
    });

    test('should detect TIME_CHANGED', () => {
      const updatedSchedule: LHUScheduleItem[] = [
        {
          ...baseSchedule[0],
          ThoiGianBD: '2026-03-02T13:30:00',
        },
      ];
      const diffs = computeScheduleDiff(baseSchedule, updatedSchedule);
      assert.strictEqual(diffs.length, 1);
      assert.strictEqual(diffs[0].type, 'TIME_CHANGED');
    });

    test('should detect TEACHER_CHANGED', () => {
      const updatedSchedule: LHUScheduleItem[] = [
        {
          ...baseSchedule[0],
          GiaoVien: 'Nguyễn Văn A',
        },
      ];
      const diffs = computeScheduleDiff(baseSchedule, updatedSchedule);
      assert.strictEqual(diffs.length, 1);
      assert.strictEqual(diffs[0].type, 'TEACHER_CHANGED');
      assert.ok(diffs[0].description.includes('Nguyễn Văn A'));
    });

    test('should detect CANCELED class', () => {
      const diffs = computeScheduleDiff(baseSchedule, []);
      assert.strictEqual(diffs.length, 1);
      assert.strictEqual(diffs[0].type, 'CANCELED');
    });

    test('should detect NEW_CLASS', () => {
      const newClassItem: LHUScheduleItem = {
        ID: 102,
        NhomID: 100083358,
        ThoiGianBD: '2026-03-02T07:30:00',
        ThoiGianKT: '2026-03-02T10:40:00',
        TenPhong: 'A201',
        TenNhom: '[23CT113]',
        TenMonHoc: 'Cơ sở dữ liệu',
        GiaoVien: 'Lê Văn B',
        TenCoSo: 'Cơ sở I',
      };
      const diffs = computeScheduleDiff(baseSchedule, [baseSchedule[0], newClassItem]);
      assert.strictEqual(diffs.length, 1);
      assert.strictEqual(diffs[0].type, 'NEW_CLASS');
    });
  });

  describe('2. Message Formatting Tests', () => {
    test('formatDailyScheduleMessage formatted correctly', () => {
      const schedule: LHUScheduleItem[] = [
        {
          ID: 1,
          NhomID: 100082388,
          ThoiGianBD: '2026-03-03T07:30:00',
          ThoiGianKT: '2026-03-03T10:40:00',
          TenPhong: 'D403_Hybrid',
          TenNhom: '[23CT113]',
          TenMonHoc: 'English 6 {CNTT 2020}',
          GiaoVien: 'Lý Tuấn Phú',
          TenCoSo: 'Cơ sở II',
          GoogleMap: 'https://maps.google.com/?q=Campus2',
          LinkKhaoSat: 'https://qa.lhu.edu.vn/f/12345',
        },
      ];

      const formatted = formatDailyScheduleMessage('Bùi Hoài Nam', '2026-03-03', schedule);
      assert.ok(formatted.includes('LỊCH HỌC NGÀY MAI - 03/03/2026'));
      assert.ok(formatted.includes('English 6 {CNTT 2020}'));
      assert.ok(formatted.includes('D403_Hybrid'));
      assert.ok(formatted.includes('https://maps.google.com/?q=Campus2'));
      assert.ok(formatted.includes('https://qa.lhu.edu.vn/f/12345'));
    });

    test('formatUrgentDiffAlertMessage formatted correctly', () => {
      const changes: ScheduleDiffChange[] = [
        {
          type: 'ROOM_CHANGED',
          subjectName: 'Lập trình Python',
          groupName: '[23CT113]',
          description: 'Đổi phòng từ C403 sang C404',
        },
      ];

      const alertStr = formatUrgentDiffAlertMessage('Bùi Hoài Nam', '2026-03-03', changes);
      assert.ok(alertStr.includes('CẢNH BÁO THAY ĐỔI LỊCH HỌC KHẨN CẤP'));
      assert.ok(alertStr.includes('Lập trình Python'));
      assert.ok(alertStr.includes('Đổi phòng từ C403 sang C404'));
    });
  });

  describe('3. Zalo Bot Command Handler Workflow', () => {
    const testZaloId = 'zalo_user_test_999';

    test('Step 1: /dangky 121000123 triggers 2-step verification', async () => {
      const res = await handleIncomingZaloMessage({
        from: testZaloId,
        senderName: 'Test Student',
        body: '/dangky 121000123',
      });

      assert.ok(res.includes('XÁC NHẬN THÔNG TIN SINH VIÊN'));

      const dbUser = await prisma.student.findUnique({ where: { zaloUserId: testZaloId } });
      assert.ok(dbUser);
      assert.strictEqual(dbUser?.pendingStudentId, '121000123');
      assert.strictEqual(dbUser?.isActive, false);
    });

    test('Step 2: "OK" confirms student registration', async () => {
      const res = await handleIncomingZaloMessage({
        from: testZaloId,
        senderName: 'Test Student',
        body: 'OK',
      });

      assert.ok(res.includes('ĐĂNG KÝ THÀNH CÔNG'));

      const dbUser = await prisma.student.findUnique({ where: { zaloUserId: testZaloId } });
      assert.strictEqual(dbUser?.studentId, '121000123');
      assert.strictEqual(dbUser?.pendingStudentId, null);
      assert.strictEqual(dbUser?.isActive, true);
    });

    test('/trangthai returns student configuration', async () => {
      const res = await handleIncomingZaloMessage({
        from: testZaloId,
        senderName: 'Test Student',
        body: '/trangthai',
      });

      assert.ok(res.includes('MSSV Liên kết: 121000123'));
      assert.ok(res.includes('20:00'));
    });

    test('/caidat 21:00 updates notification time', async () => {
      const res = await handleIncomingZaloMessage({
        from: testZaloId,
        senderName: 'Test Student',
        body: '/caidat 21:00',
      });

      assert.ok(res.includes('21:00'));

      const dbUser = await prisma.student.findUnique({ where: { zaloUserId: testZaloId } });
      assert.strictEqual(dbUser?.notifyTime, '21:00');
    });

    test('/huy deactivates user notifications', async () => {
      const res = await handleIncomingZaloMessage({
        from: testZaloId,
        senderName: 'Test Student',
        body: '/huy',
      });

      assert.ok(res.includes('ĐÃ HỦY ĐĂNG KÝ THÀNH CÔNG'));

      const dbUser = await prisma.student.findUnique({ where: { zaloUserId: testZaloId } });
      assert.strictEqual(dbUser?.isActive, false);
    });
  });
});
