import apiClient from './apiClient.js';
const config = (token, options = {}) => ({
  withCredentials: true, ...options,
  headers: { ...options.headers, Authorization: token ? 'Bearer ' + token : null },
});
const data = (response) => response.data.data;
export const tryonApi = {
  history: (page, token, signal) => apiClient.get('/api/tryon/history?page=' + page + '&limit=8', config(token, { signal })).then(data),
  job: (id, token, signal) => apiClient.get('/api/tryon/jobs/' + id, config(token, { signal })).then(data),
  byRequest: (key, token) => apiClient.get('/api/tryon/by-request/' + key, config(token)).then(data),
  start: (slug, id, payload, token) => apiClient.post('/api/stores/' + encodeURIComponent(slug) + '/products/' + id + '/pro/jobs', payload, config(token, { timeout: 60000 })).then(data),
  retry: (id, key, token) => apiClient.post('/api/tryon/jobs/' + id + '/retry', { request_key: key }, config(token)).then(data),
  erase: (id, token) => apiClient.delete('/api/tryon/jobs/' + id, config(token)).then(data),
};
