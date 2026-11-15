import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Packages from './pages/Packages.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Registrations from './pages/Registrations.jsx';
import Invoices from './pages/Invoices.jsx';
import Payments from './pages/Payments.jsx';
import Reports from './pages/Reports.jsx';
import NetworkAssets from './pages/network/NetworkAssets.jsx';
import NetworkMap from './pages/network/NetworkMap.jsx';
import Whatsapp from './pages/Whatsapp.jsx';
import Activity from './pages/Activity.jsx';
import Profile from './pages/Profile.jsx';
import { Spinner } from './components/ui.jsx';

function Private({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="empty"><Spinner /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

/** Halaman hanya untuk user dengan salah satu permission */
function Can({ perm, children }) {
  const { can, home } = useAuth();
  if (can(...perm)) return children;
  return <Navigate to={home()} replace />;
}

const P = (perm, el) => <Can perm={perm}>{el}</Can>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Private><Layout /></Private>}>
        <Route index element={P(['dashboard.view'], <Dashboard />)} />
        <Route path="network/assets" element={P(['network.view', 'network.manage'], <NetworkAssets />)} />
        <Route path="network/map" element={P(['network.view', 'network.manage'], <NetworkMap />)} />
        <Route path="registrations" element={P(['customers.register', 'customers.manage'], <Registrations />)} />
        <Route path="customers" element={P(['customers.manage'], <Customers />)} />
        <Route path="customers/:id" element={P(['customers.manage'], <CustomerDetail />)} />
        <Route path="packages" element={P(['packages.manage'], <Packages />)} />
        <Route path="invoices" element={P(['invoices.manage'], <Invoices />)} />
        <Route path="payments" element={P(['payments.view'], <Payments />)} />
        <Route path="reports" element={P(['reports.view'], <Reports />)} />
        <Route path="whatsapp" element={P(['whatsapp.manage'], <Whatsapp />)} />
        <Route path="activity" element={P(['logs.own'], <Activity />)} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
