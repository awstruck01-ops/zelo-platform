import { NavLink, useNavigate, Outlet } from 'react-router-dom';

export default function Layout() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('zelo_admin_token');
    navigate('/login');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">Zelo<span>Ops</span></div>
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Overview</NavLink>
        <NavLink to="/live-map" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Live map</NavLink>
        <NavLink to="/transactions" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Transactions</NavLink>
        <NavLink to="/verifications" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Verifications</NavLink>
        <NavLink to="/disputes" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Disputes</NavLink>
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
