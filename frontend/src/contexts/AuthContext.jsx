import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import apiClient, { setAuthToken } from '../services/apiClient';

const AuthContext = createContext(null);
const storageKey = 'marketplace_token';

function readAuthPayload(response) {
  const payload = response.data?.data;
  if (!payload?.token || !payload?.user) {
    throw new Error(response.data?.message || 'پاسخ ورود از سرور معتبر نیست. اتصال API را بررسی کنید.');
  }
  return payload;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(storageKey));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    let mounted = true;
    setAuthToken(token);

    if (!token) return undefined;

    apiClient
      .get('/api/auth/me')
      .then((response) => {
        if (mounted) setUser(response.data.data);
      })
      .catch(() => {
        localStorage.removeItem(storageKey);
        if (mounted) {
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login: async (form) => {
        const response = await apiClient.post('/api/auth/login', form);
        const payload = readAuthPayload(response);
        localStorage.setItem(storageKey, payload.token);
        setToken(payload.token);
        setUser(payload.user);
        setLoading(false);
        return payload.user;
      },
      register: async (form) => {
        const response = await apiClient.post('/api/auth/register', form);
        const payload = readAuthPayload(response);
        localStorage.setItem(storageKey, payload.token);
        setToken(payload.token);
        setUser(payload.user);
        setLoading(false);
        return payload.user;
      },
      requestOtp: async (form) => {
        const response = await apiClient.post('/api/auth/otp/request', form);
        return response.data.data;
      },
      verifyOtp: async (form) => {
        const response = await apiClient.post('/api/auth/otp/verify', form);
        const payload = readAuthPayload(response);
        localStorage.setItem(storageKey, payload.token);
        setToken(payload.token);
        setUser(payload.user);
        setLoading(false);
        return payload.user;
      },
      refreshUser: async () => {
        if (!token) {
          setUser(null);
          return null;
        }
        const response = await apiClient.get('/api/auth/me', { params: { _ts: Date.now() } });
        const nextUser = response.data.data;
        setUser(nextUser);
        return nextUser;
      },
      logout: () => {
        localStorage.removeItem(storageKey);
        setToken(null);
        setUser(null);
        setLoading(false);
      },
    }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
