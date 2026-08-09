import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();

  const logout = () => {
    localStorage.removeItem('zelo_seller_token');
    navigate('/login');
  };

  if (loading) return <div className="empty-state">Loading your storefront…</div>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><img src="/zelo-logo-horizontal.svg" alt="Zelo" style={{ height: 24 }} /><span>Seller</span></div>
        {profile?.profile && (
          <div style={{ padding: '0 12px 16px', fontSize: 13, color: 'var(--text-dim)' }}>
            {profile.profile.business_name}
            <div>
              <span className={`pill ${profile.profile.verification_status === 'approved' ? 'live' : 'pending'}`} style={{ marginTop: 6 }}>
                {profile.profile.verification_status}
              </span>
            </div>
          </div>
        )}
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Orders</NavLink>
        <NavLink to="/catalog" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Catalog</NavLink>
        <NavLink to="/earnings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Earnings</NavLink>
        <NavLink to="/messages" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Messages</NavLink>
        <div style={{ marginTop: 'auto', paddingTop: 24 }}>
          <button onClick={logout} style={{ width: '100%' }}>Sign out</button>
        </div>
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
