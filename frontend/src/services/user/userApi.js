import apiClient from '../apiClient';
import { faDate, faDateTime, formatMoney } from '../../utils/formatters';
import { getProOutputSource } from '../../utils/proOutput.js';
import { getProductImages } from '../../utils/productImage.js';

const faStatus = (status) => ({
  success: 'پرداخت شده',
  failed: 'ناموفق',
  pending: 'در انتظار',
  open: 'باز',
  answered: 'پاسخ داده شده',
  closed: 'بسته',
})[status] || status;

const normalizeTransaction = (item) => ({
  id: item.id,
  title: item.description || item.type,
  amount: formatMoney(item.amount),
  rawAmount: Number(item.amount || 0),
  status: faStatus(item.status),
  rawStatus: item.status,
  date: faDateTime(item.created_at),
  type: item.type,
  productId: item.product_id,
  reviewed: Boolean(item.reviewed),
  details: item.metadata || {},
});

const normalizeTicket = (item) => ({
  id: item.id,
  subject: item.title,
  status: faStatus(item.status),
  rawStatus: item.status,
  priority: item.priority,
  replies: Number(item.replies ?? item.messages?.length ?? 0),
  hasAttachment: Boolean(item.has_attachment) || (item.messages || []).some((message) => Boolean(message.attachment)),
  file: item.has_attachment || (item.messages || []).some((message) => Boolean(message.attachment)) ? 'دارد' : '-',
  messages: item.messages || [],
});

export const userApi = {
  async getDashboard() {
    const [dashboard, transactions] = await Promise.all([
      apiClient.get('/api/user/dashboard'),
      apiClient.get('/api/user/transactions'),
    ]);
    const tx = transactions.data.data?.financial || [];
    return {
      walletBalance: formatMoney(dashboard.data.data.wallet_balance),
      usedServices: dashboard.data.data.pro_usages || 0,
      transactions: dashboard.data.data.financial_transactions || tx.length,
      recentPurchases: tx.slice(0, 5).map(normalizeTransaction),
      charts: dashboard.data.data.charts?.length
        ? dashboard.data.data.charts
        : [{ name: 'امروز', amount: dashboard.data.data.wallet_balance || 0, orders: dashboard.data.data.financial_transactions || 0 }],
    };
  },

  async getWallet() {
    const [wallet, transactions, settingsResult] = await Promise.all([
      apiClient.get('/api/user/wallet'),
      apiClient.get('/api/user/transactions'),
      apiClient.get('/api/user/packages/settings').catch(() => ({ data: { data: { bank_info: {} } } })),
    ]);
    return {
      balance: formatMoney(wallet.data.data.balance_toman),
      bankInfo: settingsResult.data.data.bank_info || {},
      history: (transactions.data.data?.financial || []).map((item) => ({
        id: item.id,
        amount: formatMoney(item.amount),
        method: item.type,
        date: faDateTime(item.created_at),
        status: faStatus(item.status),
      })),
    };
  },

  async chargeWallet(amount, payload = {}) {
    const response = await apiClient.post('/api/user/wallet/charge', {
      amount: Number(amount),
      description: 'شارژ حساب از پنل کاربر',
      ...payload,
    }, { timeout: 20000 });
    return response.data.data;
  },

  async getPackages() {
    const [packagesResult, settingsResult] = await Promise.allSettled([
      apiClient.get('/api/user/packages'),
      apiClient.get('/api/user/packages/settings'),
    ]);

    if (packagesResult.status !== 'fulfilled') {
      throw packagesResult.reason;
    }

    const packagesResponse = packagesResult.value;
    const tokenPrice = settingsResult.status === 'fulfilled'
      ? Number(settingsResult.value.data.data.token_price || 0)
      : 25000;

    return {
      tokenPrice,
      bankInfo: settingsResult.status === 'fulfilled' ? settingsResult.value.data.data.bank_info || {} : {},
      items: packagesResponse.data.data.map((item) => ({
        id: item.id,
        name: item.title,
        period: `${Number(item.duration_days || 0).toLocaleString('fa-IR')} روزه`,
        price: formatMoney(item.price),
        rawPrice: Number(item.price || 0),
        features: item.features || [],
        proRequests: Number(item.pro_requests_count || 0),
        monthlyLimit: Number(item.monthly_pro_request_limit || 0),
      })),
    };
  },

  async purchasePackage(id, payload = {}) {
    const response = await apiClient.post(`/api/user/packages/${id}/purchase`, payload, { timeout: 20000 });
    return response.data.data;
  },

  async purchaseTokens(quantity, payload = {}) {
    const response = await apiClient.post('/api/user/tokens/purchase', { quantity, ...payload }, { timeout: 20000 });
    return response.data.data;
  },

  async getServices(search = '') {
    const [services, products] = await Promise.all([
      apiClient.get('/api/user/services'),
      apiClient.get(`/api/user/products${search ? `?q=${encodeURIComponent(search)}` : ''}`),
    ]);
    return {
      services: services.data.data.map((item) => ({
        id: item.id,
        title: item.description,
        status: faStatus(item.status),
        expiresAt: faDate(item.created_at),
        usage: formatMoney(item.amount),
        productId: item.product_id,
        productTitle: item.product_title,
        inputImage: item.input_image,
        productImage: item.product_image || item.product_images?.[0],
        outputImage: getProOutputSource(item.output_image),
        isFreeTrial: Boolean(item.is_free_trial),
      })),
      products: products.data.data.map((item) => ({
        id: item.id,
        title: item.title,
        seller: item.seller_name,
        storeSlug: item.store_slug,
        storeName: item.store_name,
        price: formatMoney(item.price),
        rawPrice: Number(item.price || 0),
        status: item.status,
        description: item.description,
        features: item.features || [],
        images: getProductImages(item),
        image: getProductImages(item)[0] || '',
        rating: Number(item.avg_rating || 0),
        reviewCount: Number(item.review_count || 0),
      })),
    };
  },

  async useProService(payload) {
    const response = await apiClient.post('/api/user/services/pro/use', payload);
    return response.data.data;
  },

  async getProQuota(productId) {
    const response = await apiClient.get(`/api/user/services/pro/quota${productId ? `?product_id=${encodeURIComponent(productId)}` : ''}`);
    return response.data.data;
  },

  async uploadProImage(productId, payload) {
    const response = await apiClient.post('/api/user/services/pro/upload', {
      product_id: productId,
      ...payload,
    });
    return response.data.data;
  },

  async purchaseProduct(id, payload) {
    const response = await apiClient.post(`/api/user/products/${id}/purchase`, payload);
    return response.data.data;
  },

  async reviewProduct(id, payload) {
    const response = await apiClient.post(`/api/user/products/${id}/review`, payload);
    return response.data.data;
  },

  async getTransactions() {
    const response = await apiClient.get('/api/user/transactions');
    return {
      financial: (response.data.data?.financial || []).map(normalizeTransaction),
      services: (response.data.data?.pro || []).map((item) => ({
        ...normalizeTransaction(item),
        title: item.description || item.product_title || 'استفاده از پرو آنلاین',
        productId: item.product_id,
        details: {
          product_title: item.product_title,
          seller_name: item.seller_name,
          store_name: item.store_name,
          input_image: item.input_image,
          product_image: item.product_image || item.product_images?.[0],
          output_image: getProOutputSource(item.output_image),
          is_free_trial: Boolean(item.is_free_trial),
        },
      })),
    };
  },

  async exportTransactions(tab = 'financial') {
    const response = await apiClient.get(`/api/user/transactions/export?tab=${tab}`, { responseType: 'blob' });
    return response.data;
  },

  async getTickets() {
    const response = await apiClient.get('/api/user/tickets');
    return response.data.data.map(normalizeTicket);
  },

  async createTicket(payload) {
    const response = await apiClient.post('/api/tickets', payload);
    return normalizeTicket(response.data.data);
  },

  async replyTicket(id, payload) {
    const response = await apiClient.post(`/api/tickets/${id}/reply`, payload);
    return normalizeTicket(response.data.data);
  },

  async getProfile() {
    const response = await apiClient.get('/api/user/profile');
    return response.data.data;
  },

  async updateProfile(payload) {
    const response = await apiClient.patch('/api/user/profile', payload);
    return response.data.data;
  },

  async getNotifications() {
    const response = await apiClient.get('/api/user/notifications');
    return response.data.data.map((item) => ({
      ...item,
      unread: !item.is_read,
      created_at: faDateTime(item.created_at),
    }));
  },

  async readNotifications() {
    await apiClient.post('/api/user/notifications/read');
  },

  readyClient: apiClient,
};
