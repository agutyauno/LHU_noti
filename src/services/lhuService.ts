import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export interface LHUStudentInfo {
  HoTen?: string;
  [key: string]: any;
}

export interface LHUScheduleSummary {
  TuanBD?: string;
  TuanKT?: string;
  TotalRecord?: number;
  [key: string]: any;
}

export interface LHUScheduleItem {
  ID: number;
  NhomID: number;
  ThoiGianBD: string;
  ThoiGianKT: string;
  TenPhong: string;
  TenNhom: string;
  TenMonHoc: string;
  GiaoVien: string;
  Buoi?: number;
  Thu?: number;
  TinhTrang?: number;
  Type?: number;
  TenCoSo?: string;
  GoogleMap?: string;
  OnlineLink?: string;
  LinkKhaoSat?: string;
  CalenType?: number;
  SoTietBuoi?: number;
}

export interface LHUApiFetchResult {
  success: boolean;
  studentName?: string;
  scheduleList: LHUScheduleItem[];
  error?: string;
}

// Create custom Axios instance with exponential backoff retry (3 retries)
const lhuClient: AxiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
  },
});

axiosRetry(lhuClient, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || (error.response?.status ? error.response.status >= 500 : false);
  },
  onRetry: (retryCount, error) => {
    logger.warn(`LHU API Retry attempt #${retryCount} due to: ${error.message}`);
  },
});

import { generateMockLHUResponse } from '../data/mockSchedule';

/**
 * Fetch schedule from LHU API for a given student ID and date (YYYY-MM-DD)
 */
export async function fetchStudentSchedule(
  studentId: string,
  dateStr: string,
  pageSize: number = 100,
  filterByExactDate: boolean = true
): Promise<LHUApiFetchResult> {
  // If USE_MOCK is true, return dynamic mock data matching real-time dates
  if (config.useMock) {
    logger.info(`[MOCK MODE ACTIVE] Serving mock schedule data for Student: ${studentId}, Date: ${dateStr}`);
    const mockRes = generateMockLHUResponse(studentId, dateStr, config.mockDiff);
    const filteredList = filterByExactDate
      ? mockRes.scheduleList.filter((item) => item?.ThoiGianBD && item.ThoiGianBD.startsWith(dateStr))
      : mockRes.scheduleList;

    return {
      success: true,
      studentName: mockRes.studentName,
      scheduleList: filteredList,
    };
  }

  const payload = {
    studentid: studentId,
    ngay: dateStr,
    pageindex: 1,
    pagesize: pageSize,
  };

  try {
    logger.info(`Fetching LHU Schedule for Student: ${studentId}, Date: ${dateStr}`);
    
    // Attempt POST request first
    let response = await lhuClient.post(config.lhuApiUrl, payload).catch(async (postErr) => {
      logger.warn(`POST request failed (${postErr.message}), falling back to GET request`);
      return await lhuClient.get(config.lhuApiUrl, { params: payload });
    });

    if (!response || !response.data) {
      return { success: false, scheduleList: [], error: 'Empty response data from LHU API' };
    }

    const data = response.data.data;
    if (!Array.isArray(data)) {
      // Check if root data itself is schedule array or error
      if (Array.isArray(response.data)) {
        const list = filterByExactDate
          ? response.data.filter((item: LHUScheduleItem) => item?.ThoiGianBD && item.ThoiGianBD.startsWith(dateStr))
          : response.data;
        return { success: true, scheduleList: list };
      }
      return { success: false, scheduleList: [], error: 'Invalid API response format' };
    }

    const studentInfoArr: LHUStudentInfo[] = data[0] || [];
    const scheduleArr: LHUScheduleItem[] = data[2] || [];

    const studentName = studentInfoArr[0]?.HoTen || undefined;

    // Filter schedule items to only include those matching exact dateStr (YYYY-MM-DD)
    const filteredSchedule = filterByExactDate
      ? scheduleArr.filter((item) => item?.ThoiGianBD && item.ThoiGianBD.startsWith(dateStr))
      : scheduleArr;

    return {
      success: true,
      studentName,
      scheduleList: filteredSchedule,
    };
  } catch (error: any) {
    logger.error(`Error fetching LHU API for student ${studentId} on ${dateStr}: ${error.message}`);
    return {
      success: false,
      scheduleList: [],
      error: error.message || 'API Network Error',
    };
  }
}
