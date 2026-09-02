import axios from 'axios';
import { normalizeApiErrors, toPersianMessage } from '../utils/errorMessages.js';

const configuredBaseURL = import.meta.env.VITE_API_BASE_URL?.trim();
const configuredForLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredBaseURL || '');
const apiBaseURL = import.meta.env.PROD && configuredForLocalhost
  ? ''
  : configuredBaseURL || (import.meta.env.PROD ? '' : 'http://localhost:5050');

const apiClient = axios.create({
  baseURL: apiBaseURL,
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
});

export const setAuthToken = (token) => {
  if (token) apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete apiClient.defaults.headers.common.Authorization;
};

apiClient.interceptors.response.use(
  (response) => response,
  (error) =>
    Promise.reject({
      message: toPersianMessage(error.response?.data?.message || error.message, 'خطای غیرمنتظره در ارتباط با سرور'),
      status: error.response?.status || 500,
      errors: normalizeApiErrors(error.response?.data?.errors || []),
    }),
);

export default apiClient;
