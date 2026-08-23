import apiClient from './apiClient';

const basePath = (slug, productId) => `/api/stores/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}/pro`;

export const publicApi = {
  async getProQuota(slug, productId) {
    const response = await apiClient.get(`${basePath(slug, productId)}/quota`);
    return response.data.data;
  },

  async getProHistory(slug, productId) {
    const response = await apiClient.get(`${basePath(slug, productId)}/history`);
    return (response.data.data || []).map((item) => ({
      id: item.id,
      title: item.description || item.product_title || 'پرو آنلاین',
      productId: item.product_id,
      inputImage: item.input_image,
      productImage: item.product_image,
      outputImage: item.output_image,
      isFreeTrial: Boolean(item.is_free_trial),
      expiresAt: new Date(item.created_at).toLocaleDateString('fa-IR'),
    }));
  },

  async uploadProImage(slug, productId, payload) {
    const response = await apiClient.post(`${basePath(slug, productId)}/upload`, payload);
    return response.data.data;
  },

  async usePro(slug, productId, payload) {
    const response = await apiClient.post(`${basePath(slug, productId)}/use`, payload);
    return response.data.data;
  },
};
