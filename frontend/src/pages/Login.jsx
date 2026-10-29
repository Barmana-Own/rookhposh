import { Navigate, useLocation } from 'react-router-dom';

export default function Login() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/seller', search, hash }} replace />;
}
