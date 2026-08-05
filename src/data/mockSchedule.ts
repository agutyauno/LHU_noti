import { LHUApiFetchResult, LHUScheduleItem } from '../services/lhuService';
import { getTodayString, getTomorrowString, getCurrentWeekDays } from '../utils/dateUtils';

/**
 * Generates dynamic, realistic mock schedule data matching LHU API response format
 */
export function generateMockLHUResponse(
  studentId: string,
  dateStr: string,
  mockDiff: boolean = false
): LHUApiFetchResult {
  const today = getTodayString();
  const tomorrow = getTomorrowString();
  const weekDays = getCurrentWeekDays();

  const mockScheduleList: LHUScheduleItem[] = [
    // Today's classes
    {
      ID: 101,
      NhomID: 100083357,
      ThoiGianBD: `${today}T07:30:00`,
      ThoiGianKT: `${today}T10:40:00`,
      TenPhong: 'C403_PM06',
      TenNhom: '[23CT113]',
      TenMonHoc: 'Lập trình Python cho máy học',
      GiaoVien: 'Đoàn Thiện Minh',
      Buoi: 1,
      Thu: 2,
      TinhTrang: 0,
      Type: 0,
      TenCoSo: 'Cơ sở I',
      GoogleMap: 'https://maps.google.com/?q=Campus1',
      OnlineLink: '',
      LinkKhaoSat: '',
      CalenType: 1,
      SoTietBuoi: 225,
    },
    {
      ID: 102,
      NhomID: 100083358,
      ThoiGianBD: `${today}T12:50:00`,
      ThoiGianKT: `${today}T16:45:00`,
      TenPhong: 'I202_PM02',
      TenNhom: '[23CT113]',
      TenMonHoc: 'Cơ sở dữ liệu nâng cao',
      GiaoVien: 'Nguyễn Trọng Vĩnh',
      Buoi: 2,
      Thu: 2,
      TinhTrang: 0,
      Type: 0,
      TenCoSo: 'Cơ sở III',
      GoogleMap: 'https://maps.google.com/?q=Campus3',
      OnlineLink: '',
      LinkKhaoSat: '',
      CalenType: 1,
      SoTietBuoi: 225,
    },

    // Tomorrow's classes
    {
      ID: 103,
      NhomID: 100082388,
      ThoiGianBD: `${tomorrow}T07:30:00`,
      ThoiGianKT: `${tomorrow}T10:40:00`,
      TenPhong: mockDiff ? 'E101_Hybrid (MOCK ĐỔI PHÒNG)' : 'D403_Hybrid',
      TenNhom: '[23CT113]',
      TenMonHoc: 'English 6 {CNTT 2020}',
      GiaoVien: mockDiff ? 'Trần Văn B (MOCK ĐỔI GV)' : 'Lý Tuấn Phú',
      Buoi: 1,
      Thu: 3,
      TinhTrang: 0,
      Type: 0,
      TenCoSo: mockDiff ? 'Cơ sở V' : 'Cơ sở II',
      GoogleMap: 'https://maps.google.com/?q=Campus2',
      OnlineLink: '',
      LinkKhaoSat: 'https://qa.lhu.edu.vn/f/A8C9FB1FBB11C679',
      CalenType: 1,
      SoTietBuoi: 180,
    },

    // Mid-week classes
    {
      ID: 104,
      NhomID: 100084123,
      ThoiGianBD: `${weekDays[3] || today}T12:50:00`,
      ThoiGianKT: `${weekDays[3] || today}T16:45:00`,
      TenPhong: 'B105',
      TenNhom: '[23CT113]',
      TenMonHoc: 'Phân tích & Thiết kế hệ thống',
      GiaoVien: 'Phạm Thị Cúc',
      Buoi: 2,
      Thu: 4,
      TinhTrang: 0,
      Type: 0,
      TenCoSo: 'Cơ sở I',
      GoogleMap: '',
      OnlineLink: 'https://teams.microsoft.com/l/meetup-join/mock',
      LinkKhaoSat: '',
      CalenType: 1,
      SoTietBuoi: 225,
    },

    // End-of-week class
    {
      ID: 105,
      NhomID: 100085456,
      ThoiGianBD: `${weekDays[5] || today}T07:30:00`,
      ThoiGianKT: `${weekDays[5] || today}T10:40:00`,
      TenPhong: 'A201',
      TenNhom: '[23CT113]',
      TenMonHoc: 'Phát triển ứng dụng Di động',
      GiaoVien: 'Lê Hoàng Long',
      Buoi: 1,
      Thu: 6,
      TinhTrang: 0,
      Type: 0,
      TenCoSo: 'Cơ sở I',
      GoogleMap: '',
      OnlineLink: '',
      LinkKhaoSat: '',
      CalenType: 1,
      SoTietBuoi: 180,
    },
  ];

  return {
    success: true,
    studentName: `Sinh viên ${studentId} (Mock Data)`,
    scheduleList: mockScheduleList,
  };
}
