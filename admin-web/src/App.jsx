import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import LiveMap from './pages/LiveMap';
import Transactions from './pages/Transactions';
import Verifications from './pages/Verifications';
import Disputes from './pages/Disputes';
import TaxForms from './pages/TaxForms';
import Messages from './pages/Messages';
import Restaurants from './pages/Restaurants';
import Stores from './pages/Stores';
import Drivers from './pages/Drivers';
import SellerDetail from './pages/SellerDetail';
import DriverDetail from './pages/DriverDetail';

function RequireAuth({ children }) {
  const token = localStorage.getItem('zelo_admin_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Overview />} />
          <Route path="live-map" element={<LiveMap />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="verifications" element={<Verifications />} />
          <Route path="disputes" element={<Disputes />} />
          <Route path="tax-forms" element={<TaxForms />} />
          <Route path="messages" element={<Messages />} />
          <Route path="restaurants" element={<Restaurants />} />
          <Route path="stores" element={<Stores />} />
          <Route path="drivers" element={<Drivers />} />
          <Route path="sellers/:id" element={<SellerDetail />} />
          <Route path="drivers/:id" element={<DriverDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
