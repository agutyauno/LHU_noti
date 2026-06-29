/**
 * Generates raw mock schedules mimicking the response structure of LHU API
 */
export function getMockRawSchedules(studentId) {
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  return [
    {
      ID: "1",
      TenMonHoc: "Lập trình Web nâng cao",
      TenPhong: "I.304",
      GiaoVien: "ThS. Nguyễn Văn A",
      ThoiGianBD: `${today}T07:30:00`,
      ThoiGianKT: `${today}T09:00:00`,
      Tiet: "1 - 3",
      TenNhom: "22DTH1"
    },
    {
      ID: "2",
      TenMonHoc: "Trí tuệ nhân tạo",
      TenPhong: "I.202",
      GiaoVien: "TS. Lê Hoàng B",
      ThoiGianBD: `${tomorrow}T07:30:00`,
      ThoiGianKT: `${tomorrow}T11:00:00`,
      Tiet: "1 - 4",
      TenNhom: "22DTH2"
    },
    {
      ID: "3",
      TenMonHoc: "Đồ họa máy tính",
      TenPhong: "I.202",
      GiaoVien: "ThS. Hoàng Thị C",
      ThoiGianBD: `${tomorrow}T16:15:00`,
      ThoiGianKT: `${tomorrow}T18:50:00`,
      Tiet: "11 - 15",
      TenNhom: "22DTH1"
    },
    {
      ID: "4",
      TenMonHoc: "Lập trình Web nâng cao",
      TenPhong: "I.304",
      GiaoVien: "ThS. Hoàng Thị C",
      ThoiGianBD: `${today}T10:16:00`,
      ThoiGianKT: `${today}T12:40:00`,
      Tiet: "6 - 9",
      TenNhom: "22DTH1"
    },
    {
      ID: "5",
      TenMonHoc: "Lập trình Web nâng cao",
      TenPhong: "I.304",
      GiaoVien: "ThS. Hoàng Thị C",
      ThoiGianBD: `${today}T10:24:00`,
      ThoiGianKT: `${today}T12:40:00`,
      Tiet: "6 - 9",
      TenNhom: "22DTH1"
    },
    {
      ID: "6",
      TenMonHoc: "Lập trình Web 2",
      TenPhong: "I.304",
      GiaoVien: "ThS. Hoàng Thị C",
      ThoiGianBD: `${today}T15:40:00`,
      ThoiGianKT: `${today}T18:50:00`,
      Tiet: "6 - 9",
      TenNhom: "22DTH1"
    }
  ];
}
