import { useEffect, useState } from 'react';
import api from '../api';

const formatUSD = (n) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Overview() {
  const [revenue, setRevenue] = useState(null);
  const [pending, setPending] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [error, setError] = useState('');

  // Dropdown open/closed state for each section
  const [restaurantsOpen, setRestaurantsOpen] = useState(false);
  const [storesOpen, setStoresOpen] = useState(false);

  // Seller pending delete confirmation (holds the seller object, or null)
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [suspendingId, setSuspendingId] = useState(null);

  const loadSellers = () => {
    api
      .get('/admin/sellers')
      .then((res) => setSellers(res.data.data || []))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load sellers'));
  };

  useEffect(() => {
    Promise.all([api.get('/admin/revenue'), api.get('/admin/verifications/pending')])
      .then(([revRes, pendingRes]) => {
        setRevenue(revRes.data.data);
        setPending(pendingRes.data.data);
      })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load overview'));

    loadSellers();
  }, []);

  const restaurants = sellers.filter((s) => s.category === 'restaurant');
  const stores = sellers.filter((s) => s.category === 'store');

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/sellers/${confirmDelete.id}`);
      setSellers((prev) => prev.filter((s) => s.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete seller');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleSuspend = async (seller) => {
    const nextStatus = seller.account_status === 'suspended' ? 'active' : 'suspended';
    setSuspendingId(seller.id);
    try {
      await api.patch(`/admin/users/${seller.user_id}/status`, { status: nextStatus });
      setSellers((prev) =>
        prev.map((s) => (s.id === seller.id ? { ...s, account_status: nextStatus } : s))
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update seller status');
    } finally {
      setSuspendingId(null);
    }
  };

  const SellerList = ({ title, items, open, onToggle }) => (
    <div className="panel">
      <div className="panel-header" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <h2>
          {title} ({items.length})
        </h2>
        <span>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        items.length === 0 ? (
          <div className="empty-state">No {title.toLowerCase()} signed up yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Business name</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Signed up</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.image_url && !s.image_url.match(/\.(mp4|mov|webm)$/i) ? (
                      <img
                        src={s.image_url}
                        alt={s.business_name}
                        style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }}
                      />
                    ) : (
                      <span className="mono">—</span>
                    )}
                  </td>
                  <td>{s.business_name}</td>
                  <td className="mono">{s.phone}</td>
                  <td>
                    <span className={`pill ${s.verification_status === 'approved' ? 'approved' : 'pending'}`}>
                      {s.verification_status}
                    </span>
                    {s.account_status === 'suspended' && (
                      <span className="pill" style={{ marginLeft: 6, background: '#7a2020', color: '#fff' }}>
                        Suspended
                      </span>
                    )}
                  </td>
                  <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-secondary"
                      onClick={() => handleToggleSuspend(s)}
                      disabled={suspendingId === s.id}
                    >
                      {suspendingId === s.id
                        ? 'Updating…'
                        : s.account_status === 'suspended'
                        ? 'Reactivate'
                        : 'Suspend'}
                    </button>
                    <button className="btn-danger" onClick={() => setConfirmDelete(s)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <p>Platform performance at a glance</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {revenue && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="label">Total platform revenue</div>
            <div className="value">{formatUSD(revenue.total_platform_revenue)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Commission revenue</div>
            <div className="value">{formatUSD(revenue.commission_revenue)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Delivery margin</div>
            <div className="value">{formatUSD(revenue.delivery_margin_revenue)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Subscription revenue</div>
            <div className="value">{formatUSD(revenue.subscription_revenue)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Completed orders</div>
            <div className="value">{revenue.completed_orders}</div>
          </div>
          <div className="stat-card">
            <div className="label">Gross transaction volume</div>
            <div className="value">{formatUSD(revenue.gross_transaction_volume)}</div>
          </div>
        </div>
      )}

      {pending && (
        <div className="panel">
          <div className="panel-header">
            <h2>Pending verification</h2>
          </div>
          {pending.sellers.length === 0 && pending.drivers.length === 0 ? (
            <div className="empty-state">Nothing waiting on review right now.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Type</th><th>Name</th><th>Phone</th><th>Submitted</th></tr>
              </thead>
              <tbody>
                {pending.sellers.map((s) => (
                  <tr key={s.id}>
                    <td><span className="pill pending">Seller</span></td>
                    <td>{s.business_name}</td>
                    <td className="mono">{s.phone}</td>
                    <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {pending.drivers.map((d) => (
                  <tr key={d.id}>
                    <td><span className="pill pending">Driver</span></td>
                    <td>{d.vehicle_type}</td>
                    <td className="mono">{d.phone}</td>
                    <td>{new Date(d.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <SellerList
        title="Restaurants"
        items={restaurants}
        open={restaurantsOpen}
        onToggle={() => setRestaurantsOpen((o) => !o)}
      />

      <SellerList
        title="Stores"
        items={stores}
        open={storesOpen}
        onToggle={() => setStoresOpen((o) => !o)}
      />

      {confirmDelete && (
        <div
          onClick={() => !deleting && setConfirmDelete(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#111',
              border: '1px solid #333',
              borderRadius: 10,
              padding: 24,
              maxWidth: 400,
              width: '90%',
              color: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Delete seller?</h3>
            <p>
              Are you sure you want to delete <strong>{confirmDelete.business_name}</strong>?
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                className="btn-secondary"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button className="btn-danger" onClick={handleDeleteConfirmed} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
