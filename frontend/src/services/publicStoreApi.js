import apiClient from './apiClient.js';
import { READ_TIMEOUT_MS, readWithRetry } from '../utils/requestPolicy.js';

export const publicStoreApi = {
  read(slug, productId, signal) {
    return readWithRetry(async () => {
      const response = await apiClient.get('/api/stores/' + encodeURIComponent(slug), {
        params: { view: 'page', ...(productId ? { productId } : {}) }, signal, timeout: READ_TIMEOUT_MS,
        headers: { Authorization: null },
      });
      const data = response.data.data;
      if (!data || typeof data !== 'object' || !Array.isArray(data.products)) throw { status: 502, code: 'INVALID_PUBLIC_RESPONSE', message: 'اطلاعات فروشگاه کامل دریافت نشد.' };
      return data;
    }, { signal });
  },
};
