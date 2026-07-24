import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
import Orders from './pages/Orders';
import Catalog from './pages/Catalog';
import Earnings from './pages/Earnings';
import { AuthProvider } from './context/AuthContext';

function RequireAuth({ children }) {
  const token = localStorage.getItem('zelo_seller_token');
  if (!token) return <Navigate to="/login" replace />;
  return <AuthProvider>{children}</AuthProvider>;
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
          <Route index element={<Orders />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="earnings" element={<Earnings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
