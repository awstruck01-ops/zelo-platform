import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

function DocThumb({ url, label, onOpen }) {
  if (!url) {
    return (
      <div style={{ fontSize: 12, opacity: 0.5, width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #444', borderRadius: 6 }}>
        None
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={label}
      onClick={() => onOpen(url, label)}
      style={{ width: 72, height: 72, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', border: '1px solid #333' }}
    />
  );
}

function Lightbox({ doc, onClose }) {
  if (!doc) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, cursor: 'zoom-out', padding: 24,
      }}
    >
      <div style={{ color: '#fff', marginBottom: 12, fontSize: 14, opacity: 0.85 }}>{doc.label} — click anywhere to close</div>
      <img src={doc.url} alt={doc.label} style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }} />
    </div>
  );
}

export default function SellerDetail() {
  const { id } = useParams();
  const [seller, setSeller] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lightboxDoc, setLightboxDoc] = useState(null);

  const load = () => {
    api.get(`/admin/sellers/${id}`)
      .then((res) => setSeller(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load seller'));
  };

  useEffect(() => {
    load();
    api.get('/admin/transactions', { params: { seller_id: id, limit: 25 } })
      .then((res) => setOrders(res.data.data))
      .catch(() => {});
  }, [id]);

  const verify = async (status) => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/admin/sellers/${id}/verify`, { status });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const setAccountStatus = async (status) => {
    if (!seller?.user_id) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/admin/users/${seller.user_id}/status`, { status });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (error && !seller) {
    return (
      <>
        <div className="page-header"><h1>Seller not found</h1></div>
        <div className="error-banner">{error}</div>
      </>
    );
  }
  if (!seller) return <div className="page-header"><h1>Loading...</h1></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <Link to={seller.category === 'restaurant' ? '/restaurants' : '/stores'} style={{ fontSize: 13 }}>
            ← Back to {seller.category === 'restaurant' ? 'Restaurants' : 'Stores'}
          </Link>
          <h1>{seller.business_name}</h1>
          <p style={{ textTransform: 'capitalize' }}>{seller.category} · {seller.address}</p>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div className="panel-header"><h2>Profile</h2></div>
        <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div><div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Phone</div><div className="mono">{seller.phone}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Email</div><div>{seller.email || '—'}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Verification status</div><div style={{ textTransform: 'capitalize' }}>{seller.verification_status}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Account status</div><div style={{ textTransform: 'capitalize' }}>{seller.account_status}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Joined</div><div>{seller.created_at ? new Date(seller.created_at).toLocaleDateString() : '—'}</div></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Documents</h2></div>
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Storefront</div>
            <DocThumb url={seller.image_url} label={`${seller.business_name} — Storefront`} onOpen={(url, label) => setLightboxDoc({ url, label })} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Business License</div>
            <DocThumb url={seller.business_license_url} label={`${seller.business_name} — Business License`} onOpen={(url, label) => setLightboxDoc({ url, label })} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Owner ID</div>
            <DocThumb url={seller.id_document_url} label={`${seller.business_name} — Owner ID`} onOpen={(url, label) => setLightboxDoc({ url, label })} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Owner ID (Back)</div>
            <DocThumb url={seller.id_document_back_url} label={`${seller.business_name} — Owner ID (Back)`} onOpen={(url, label) => setLightboxDoc({ url, label })} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Status controls</h2></div>
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="primary" disabled={busy} onClick={() => verify('approved')}>Approve verification</button>
          <button className="danger" disabled={busy} onClick={() => verify('rejected')}>Reject verification</button>
          {seller.account_status === 'active' ? (
            <button className="danger" disabled={busy} onClick={() => setAccountStatus('suspended')}>Suspend account</button>
          ) : (
            <button className="primary" disabled={busy} onClick={() => setAccountStatus('active')}>Reactivate account</button>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Recent orders</h2></div>
        {orders.length === 0 ? (
          <div className="empty-state">No orders yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Total</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{String(o.id).slice(0, 8)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{o.status}</td>
                  <td>${Number(o.total_amount || 0).toFixed(2)}</td>
                  <td>{o.placed_at ? new Date(o.placed_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Lightbox doc={lightboxDoc} onClose={() => setLightboxDoc(null)} />
    </>
  );
}
