import apiClient from '../apiClient';
import { faDate, faDateTime, formatMoney } from '../../utils/formatters';
import { getProductImages } from '../../utils/productImage';

const faStatus = (status) => ({
  pending: 'در انتظار بررسی',
  active: 'تایید شده',
  rejected: 'رد شده',
  success: 'موفق',
  failed: 'ناموفق',
  open: 'باز',
  answered: 'پاسخ داده شده',
  closed: 'بسته',
})[status] || status;

const normalizeTicket = (item) => ({
  id: item.id,
  subject: item.title,
  status: faStatus(item.status),
  rawStatus: item.status,
  priority: item.priority,
  replies: Number(item.replies ?? item.messages?.length ?? 0),
  hasAttachment: Boolean(item.has_attachment) || (item.messages || []).some((message) => Boolean(message.attachment)),
  messages: item.messages || [],
});

export const sellerApi = {
  async getDashboard() {
    const response = await apiClient.get('/api/seller/dashboard');
    const data = response.data.data;
    return {
      stats: [
        { label: 'محصولات تایید شده', value: data.active_products || 0, delta: 'زنده' },
        { label: 'در انتظار بررسی', value: data.pending_products || 0, delta: 'زنده' },
        { label: 'رد شده', value: data.rejected_products || 0, delta: 'زنده' },
        { label: 'مشتری‌ها', value: data.customers || 0, delta: 'زنده' },
      ],
      charts: data.charts?.length ? data.charts : [{ name: 'امروز', sales: data.sales_total || 0, orders: data.customers || 0 }],
    };
  },

  async getProducts(search = '') {
    const response = await apiClient.get(`/api/seller/products${search ? `?q=${encodeURIComponent(search)}` : ''}`);
    return response.data.data.map((item) => ({
      ...item,
      features: item.features || [],
      images: getProductImages(item),
      price: formatMoney(item.price),
      rawPrice: Number(item.price || 0),
      stock: item.stock || '-',
      statusLabel: faStatus(item.status),
      publishStatus: item.publish_status || 'active',
      publishLabel: (item.publish_status || 'active') === 'inactive' ? 'غیرفعال در سایت' : 'فعال در سایت',
      pendingChanges: item.pending_changes,
      hasPendingChanges: Boolean(item.pending_changes),
      rejectionReason: item.reject_reason,
      image: getProductImages(item)[0] || '',
      rating: Number(item.avg_rating || 0),
      reviewCount: Number(item.review_count || 0),
      created_at: faDate(item.created_at),
    }));
  },

  async createProduct(payload) {
    const response = await apiClient.post('/api/seller/products', payload);
    return response.data.data;
  },

  async updateProduct(id, payload) {
    const response = await apiClient.patch(`/api/seller/products/${id}`, payload);
    return response.data.data;
  },

  async setProductPublishStatus(id, publishStatus) {
    const response = await apiClient.patch(`/api/seller/products/${id}/publish`, { publish_status: publishStatus });
    return response.data.data;
  },

  async getProductQrCode(id) {
    const response = await apiClient.get(`/api/seller/products/${id}/qrcode`);
    return response.data.data;
  },

  async getCustomers() {
    const response = await apiClient.get('/api/seller/customers');
    return response.data.data.map((item) => ({
      ...item,
      name: item.fullname,
      orders: Number(item.orders || 0),
      status: item.status === 'active' ? 'فعال' : item.status === 'blocked' ? 'مسدود' : item.status,
      last_order_at: item.last_order_at ? faDateTime(item.last_order_at) : '-',
    }));
  },

  async exportCustomers() {
    const response = await apiClient.get('/api/seller/customers/export', { responseType: 'blob' });
    return response.data;
  },

  async getTransactions() {
    const response = await apiClient.get('/api/seller/transactions');
    return response.data.data.map((item) => ({
      id: item.id,
      title: item.description,
      amount: formatMoney(item.amount),
      rawAmount: Number(item.amount || 0),
      status: faStatus(item.status),
      date: faDateTime(item.created_at),
      type: item.type,
      details: item.metadata || {},
    }));
  },

  async getWallet() {
    const [wallet, transactions, settingsResult] = await Promise.all([
      apiClient.get('/api/seller/wallet'),
      apiClient.get('/api/seller/transactions'),
      apiClient.get('/api/seller/packages/settings').catch(() => ({ data: { data: { bank_info: {} } } })),
    ]);
    return {
      balance: formatMoney(wallet.data.data.balance_toman),
      bankInfo: settingsResult.data.data.bank_info || {},
      history: (transactions.data.data || []).map((item) => ({
        id: item.id,
        amount: formatMoney(item.amount),
        method: item.type,
        date: faDateTime(item.created_at),
        status: faStatus(item.status),
      })),
    };
  },

  async chargeWallet(amount, payload = {}) {
    const response = await apiClient.post('/api/seller/wallet/charge', {
      amount: Number(amount),
      description: 'شارژ کیف پول فروشنده',
      ...payload,
    });
    return response.data.data;
  },

  async exportTransactions() {
    const response = await apiClient.get('/api/seller/transactions/export', { responseType: 'blob' });
    return response.data;
  },

  async getPackages() {
    const [packagesResult, settingsResult] = await Promise.allSettled([
      apiClient.get('/api/seller/packages'),
      apiClient.get('/api/seller/packages/settings'),
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
        ...item,
        name: item.title,
        price: formatMoney(item.price),
        rawPrice: Number(item.price || 0),
        features: item.features || [],
        proRequests: Number(item.pro_requests_count || 0),
        monthlyLimit: Number(item.monthly_pro_request_limit || 0),
      })),
    };
  },

  async purchasePackage(id, payload = {}) {
    const response = await apiClient.post(`/api/seller/packages/${id}/purchase`, payload);
    return response.data.data;
  },

  async purchaseTokens(quantity, payload = {}) {
    const response = await apiClient.post('/api/seller/tokens/purchase', { quantity, ...payload });
    return response.data.data;
  },

  async getTickets() {
    const response = await apiClient.get('/api/seller/tickets');
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

  async getStore() {
    const response = await apiClient.get('/api/seller/store/preview');
    return response.data.data;
  },

  async updateStore(payload) {
    const response = await apiClient.patch('/api/seller/store', payload);
    return response.data.data;
  },

  async getStoreQrCode() {
    const response = await apiClient.get('/api/seller/store/qrcode');
    return response.data.data;
  },

  async getNotifications() {
    const response = await apiClient.get('/api/seller/notifications');
    return response.data.data.map((item) => ({ ...item, unread: !item.is_read, created_at: faDateTime(item.created_at) }));
  },

  async readNotifications() {
    await apiClient.post('/api/seller/notifications/read');
  },

  readyClient: apiClient,
};
