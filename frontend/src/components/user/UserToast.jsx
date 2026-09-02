import { useUser } from '../../contexts/UserContext';
export default function UserToast() { const { toast } = useUser(); if (!toast) return null; return <div className="fixed bottom-5 left-5 z-50 rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-bold text-white shadow-2xl">{toast}</div>; }

