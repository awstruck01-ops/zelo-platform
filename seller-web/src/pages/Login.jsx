import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { phone, password });
      const { token, user } = res.data.data;
      if (user.role !== 'seller') {
        setError('This account is not registered as a seller.');
        setLoading(false);
        return;
      }
      localStorage.setItem('zelo_seller_token', token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
       <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/zelo-logo-horizontal.svg" alt="Zelo" style={{ height: 36 }} />
              <span style={{ color: 'var(--accent-live)' }}>Seller</span>
            </h1>
        <p>Manage your storefront, orders, and earnings</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="phone">Phone number</label>
            <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 12 }}>
  New seller? <Link to="/register">Create an account</Link>
</p>
      </div>
    </div>
  );
}
