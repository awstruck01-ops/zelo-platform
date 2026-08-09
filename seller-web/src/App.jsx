import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Layout from './components/Layout';
import Orders from './pages/Orders';
import Catalog from './pages/Catalog';
import Earnings from './pages/Earnings';
import Messages from './pages/Messages';
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
        <Route path="/register" element={<Register />} />
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
          <Route path="messages" element={<Messages />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
