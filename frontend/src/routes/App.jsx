import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout.jsx';
import SkeletonGrid from '../components/ui/Skeleton.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { accountHome } from '../utils/authNavigation.js';

const Dashboard = lazy(() => import('../pages/Dashboard/Dashboard.jsx'));
const Products = lazy(() => import('../pages/Products/Products.jsx'));
const Users = lazy(() => import('../pages/Users/Users.jsx'));
const AdminPackages = lazy(() => import('../pages/Packages/AdminPackages.jsx'));
const Financial = lazy(() => import('../pages/Financial/Financial.jsx'));
const Support = lazy(() => import('../pages/Support/Support.jsx'));
const TicketConversation = lazy(() => import('../pages/Tickets/TicketConversation.jsx'));

const SellerDashboard = lazy(() => import('../pages/Seller/Dashboard/SellerDashboard.jsx'));
const SellerProducts = lazy(() => import('../pages/Seller/Products/SellerProducts.jsx'));
const SellerCustomers = lazy(() => import('../pages/Seller/Customers/SellerCustomers.jsx'));
const SellerTransactions = lazy(() => import('../pages/Seller/Transactions/SellerTransactions.jsx'));
const SellerWallet = lazy(() => import('../pages/Seller/Wallet/SellerWallet.jsx'));
const SellerPackages = lazy(() => import('../pages/Seller/Packages/SellerPackages.jsx'));
const SellerTickets = lazy(() => import('../pages/Seller/Tickets/SellerTickets.jsx'));
const SellerStore = lazy(() => import('../pages/Seller/Store/SellerStore.jsx'));
const SellerStoreProfile = lazy(() => import('../pages/Seller/Store/SellerStoreProfile.jsx'));
const PendingSeller = lazy(() => import('../pages/Seller/PendingSeller.jsx'));

const Login = lazy(() => import('../pages/Login.jsx'));
const AdminLogin = lazy(() => import('../pages/AdminLogin.jsx'));
const SellerAuth = lazy(() => import('../pages/SellerAuth.jsx'));
const ErrorPage = lazy(() => import('../pages/ErrorPage.jsx'));
const PublicStore = lazy(() => import('../pages/PublicStore.jsx'));
const PublicProduct = lazy(() => import('../pages/PublicProduct.jsx'));
const PaymentResult = lazy(() => import('../pages/PaymentResult.jsx'));

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <SkeletonGrid />;
  return <Navigate to={accountHome(user)} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<SkeletonGrid />}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/payments/result/:id" element={<PaymentResult />} />
        <Route path="/admin/v2/login" element={<AdminLogin />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/v2" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/v2/dashboard" element={<Navigate to="/admin" replace />} />
        <Route path="/seller" element={<SellerAuth />} />
        <Route path="/seller/status" element={<PendingSeller />} />
        <Route path="/stores/:slug" element={<PublicStore />} />
        <Route path="/stores/:slug/products/:productId" element={<PublicProduct />} />

        <Route element={<AppLayout role="Admin" />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/products" element={<Products />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/packages" element={<AdminPackages />} />
          <Route path="/admin/financial" element={<Financial />} />
          <Route path="/admin/support" element={<Support />} />
          <Route path="/admin/support/tickets/:ticketId" element={<TicketConversation />} />
        </Route>

        <Route element={<AppLayout role="Seller" />}>
          <Route path="/seller/dashboard" element={<SellerDashboard />} />
          <Route path="/seller/products" element={<SellerProducts />} />
          <Route path="/seller/customers" element={<SellerCustomers />} />
          <Route path="/seller/transactions" element={<SellerTransactions />} />
          <Route path="/seller/wallet" element={<SellerWallet />} />
          <Route path="/seller/packages" element={<SellerPackages />} />
          <Route path="/seller/tickets" element={<SellerTickets />} />
          <Route path="/seller/tickets/:ticketId" element={<TicketConversation />} />
          <Route path="/seller/store/profile" element={<SellerStoreProfile />} />
          <Route path="/seller/store" element={<SellerStore />} />
        </Route>

        <Route path="/user/*" element={<Login />} />

        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </Suspense>
  );
}
