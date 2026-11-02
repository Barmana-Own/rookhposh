import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import apiClient, { setAuthToken } from '../services/apiClient';
import { AUTH_STORAGE_KEY, createAuthSession } from '../services/authSession.js';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session] = useState(() => createAuthSession({ api: apiClient, storage: localStorage, setAuthToken }));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    void session.start();
    const online = () => { if (session.getSnapshot().status === 'temporarilyUnavailable') void session.retry(); };
    const storage = (event) => { if (event.key === AUTH_STORAGE_KEY || event.key === null) session.syncFromStorage(); };
    window.addEventListener('online', online); window.addEventListener('storage', storage);
    return () => { session.stop(); window.removeEventListener('online', online); window.removeEventListener('storage', storage); };
  }, [session]);
  const value = useMemo(() => ({
    ...state,
    loading: state.status === 'checking',
    retryAuth: session.retry,
    login: (form) => session.authenticate(() => apiClient.post('/api/auth/login', form)),
    register: (form) => session.authenticate(() => apiClient.post('/api/auth/register', form)),
    requestOtp: async (form) => (await apiClient.post('/api/auth/otp/request', form)).data.data,
    verifyOtp: (form) => session.authenticate(() => apiClient.post('/api/auth/otp/verify', form)),
    refreshUser: session.check,
    logout: session.logout,
  }), [session, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
