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

/**
 * Fetch schedule from LHU API for a given student ID and date (YYYY-MM-DD)
 */
export async function fetchStudentSchedule(studentId: string, dateStr: string): Promise<LHUApiFetchResult> {
  const payload = {
    studentid: studentId,
    ngay: dateStr,
    pageindex: 1,
    pagesize: 100,
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
        return { success: true, scheduleList: response.data };
      }
      return { success: false, scheduleList: [], error: 'Invalid API response format' };
    }

    const studentInfoArr: LHUStudentInfo[] = data[0] || [];
    const scheduleArr: LHUScheduleItem[] = data[2] || [];

    const studentName = studentInfoArr[0]?.HoTen || undefined;

    return {
      success: true,
      studentName,
      scheduleList: scheduleArr,
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
