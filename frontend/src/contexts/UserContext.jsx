import { createContext, useContext, useMemo, useState } from 'react';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [toast, setToast] = useState('');
  const showToast = (message) => { setToast(message); setTimeout(() => setToast(''), 2400); };
  const value = useMemo(() => ({ toast, showToast }), [toast]);
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export const useUser = () => useContext(UserContext);

