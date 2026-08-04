import { LHUScheduleItem } from './lhuService';
import { formatDisplayDate, formatTimeString, getSessionOfDay } from '../utils/dateUtils';
import { ScheduleDiffChange } from './diffService';

export function formatDailyScheduleMessage(
  studentName: string,
  dateStr: string,
  schedule: LHUScheduleItem[],
  title: string = 'LỊCH HỌC NGÀY MAI'
): string {
  const displayDate = formatDisplayDate(dateStr);
  const nameGreeting = studentName ? ` ${studentName}` : '';

  if (!schedule || schedule.length === 0) {
    return `📚 [${title} - ${displayDate}]\nChào${nameGreeting}, ngày ${displayDate} bạn không có lịch học nào. Chúc bạn có khoảng thời gian nghỉ ngơi vui vẻ!`;
  }

  let text = `📚 [${title} - ${displayDate}]\nChào${nameGreeting}, dưới đây là danh sách lịch học của bạn:\n\n`;

  schedule.forEach((item, index) => {
    const timeStart = formatTimeString(item.ThoiGianBD);
    const timeEnd = formatTimeString(item.ThoiGianKT);
    const session = getSessionOfDay(item.ThoiGianBD);

    text += `${index + 1}. ${item.TenMonHoc} ${item.TenNhom || ''}\n`;
    text += `⏱️ Thời gian: ${timeStart} - ${timeEnd} (${session})\n`;
    text += `🏫 Phòng: ${item.TenPhong || 'Chưa xếp phòng'} (${item.TenCoSo || 'Chưa xác định cơ sở'})\n`;
    text += `👨‍🏫 Giảng viên: ${item.GiaoVien || 'Chưa cập nhật'}\n`;

    const links: string[] = [];
    if (item.OnlineLink && item.OnlineLink.trim()) {
      links.push(`   - 🔗 Link học Online: ${item.OnlineLink.trim()}`);
    }
    if (item.LinkKhaoSat && item.LinkKhaoSat.trim()) {
      links.push(`   - 📝 Khảo sát môn học: ${item.LinkKhaoSat.trim()}`);
    }
    if (item.GoogleMap && item.GoogleMap.trim()) {
      links.push(`   - 📍 Bản đồ cơ sở: ${item.GoogleMap.trim()}`);
    }

    if (links.length > 0) {
      text += `📌 Ghi chú & Liên kết:\n${links.join('\n')}\n`;
    }
    text += `\n`;
  });

  text += `---\nChúc bạn một ngày học tập hiệu quả!`;
  return text.trim();
}

export function formatWeeklyScheduleMessage(
  studentName: string,
  weeklyMap: Array<{ date: string; schedule: LHUScheduleItem[] }>
): string {
  const nameGreeting = studentName ? ` ${studentName}` : '';
  let text = `📅 [LỊCH HỌC TUẦN NÀY]\nChào${nameGreeting}, dưới đây là lịch học tuần này của bạn:\n\n`;

  let totalClasses = 0;
  weeklyMap.forEach(({ date, schedule }) => {
    const displayDate = formatDisplayDate(date);
    if (schedule.length > 0) {
      totalClasses += schedule.length;
      text += `📌 Ngày ${displayDate}:\n`;
      schedule.forEach((item) => {
        const timeStart = formatTimeString(item.ThoiGianBD);
        const timeEnd = formatTimeString(item.ThoiGianKT);
        text += `  • ${timeStart}-${timeEnd}: ${item.TenMonHoc} (Phòng: ${item.TenPhong || 'N/A'})\n`;
      });
      text += `\n`;
    }
  });

  if (totalClasses === 0) {
    text += `Trong tuần này bạn không có buổi học nào. Chúc bạn có khoảng thời gian nghỉ ngơi vui vẻ!`;
  } else {
    text += `---\nTổng số buổi học trong tuần: ${totalClasses} buổi.`;
  }

  return text.trim();
}

export function formatUrgentDiffAlertMessage(
  studentName: string,
  dateStr: string,
  changes: ScheduleDiffChange[]
): string {
  const displayDate = formatDisplayDate(dateStr);
  const nameGreeting = studentName ? ` ${studentName}` : '';

  let text = `🚨 [CẢNH BÁO THAY ĐỔI LỊCH HỌC KHẨN CẤP]\nChào${nameGreeting}, hệ thống phát hiện có sự thay đổi đột xuất trong lịch học ngày ${displayDate}:\n\n`;

  changes.forEach((chg, idx) => {
    let icon = '⚠️';
    if (chg.type === 'CANCELED') icon = '❌';
    else if (chg.type === 'NEW_CLASS') icon = '🆕';
    else if (chg.type === 'ROOM_CHANGED') icon = '🏫';
    else if (chg.type === 'TIME_CHANGED') icon = '⏱️';
    else if (chg.type === 'TEACHER_CHANGED') icon = '👨‍🏫';

    text += `${idx + 1}. ${icon} ${chg.subjectName} (${chg.groupName})\n`;
    text += `   Mô tả thay đổi: ${chg.description}\n\n`;
  });

  text += `⚠️ Vui lòng kiểm tra lại thời gian và phòng học để chuẩn bị tốt nhất!\n---`;
  return text.trim();
}
