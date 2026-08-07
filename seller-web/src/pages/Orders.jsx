import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import OrderRail from '../components/OrderRail';

const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ACTION_BY_STATUS = {
  payment_confirmed: [
    { action: 'accept', label: 'Accept order', cls: 'primary' },
    { action: 'reject', label: 'Reject', cls: 'danger' },
  ],
  preparing: [{ action: 'ready', label: 'Mark ready for pickup', cls: 'primary' }],
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [needsTaxForm, setNeedsTaxForm] = useState(false);

  const load = () => {
    api.get('/orders')
      .then((res) => setOrders(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load orders'));
  };

  useEffect(() => {
    load();
    api.get('/sellers/me/tax-form/current')
      .then((res) => setNeedsTaxForm(!!res.data.data.needs_submission))
      .catch(() => {});
    const interval = setInterval(load, 6000);
    return () => clearInterval(interval);
  }, []);

  const act = async (orderId, action) => {
    setBusyId(orderId);
    try {
      await api.patch(`/orders/${orderId}/status`, { action });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const incoming = orders.filter((o) => ['payment_confirmed', 'preparing'].includes(o.status));
  const inFlight = orders.filter((o) => ['driver_searching', 'driver_assigned', 'picked_up', 'en_route_to_customer', 'arrived_at_customer', 'delivered'].includes(o.status));
  const history = orders.filter((o) => ['completed', 'cancelled', 'disputed'].includes(o.status));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p>Incoming orders alert here — accept, prepare, then hand off to your driver</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {needsTaxForm && (
        <div className="pill pending" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
          <span>Tax information needed before you can be paid out.</span>
          <Link to="/earnings#tax-info" className="primary" style={{ padding: '6px 14px', borderRadius: 6, textDecoration: 'none' }}>
            Complete tax form
          </Link>
        </div>
      )}

      <div className="panel">
        <div className="panel-header"><h2>Needs your action ({incoming.length})</h2></div>
        {incoming.length === 0 ? (
          <div className="empty-state">No new orders right now.</div>
        ) : (
          <table>
            <thead><tr><th>Order</th><th>Items</th><th>Total</th><th>Status</th><th /></tr></thead>
            <tbody>
              {incoming.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id.slice(0, 8)}</td>
                  <td>{o.items?.length ?? '—'} item(s)</td>
                  <td className="mono">{formatUSD(o.total_amount)}</td>
                  <td><span className="pill pending">{o.status.replace(/_/g, ' ')}</span></td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    {(ACTION_BY_STATUS[o.status] || []).map((a) => (
                      <button key={a.action} className={a.cls} disabled={busyId === o.id} onClick={() => act(o.id, a.action)}>
                        {a.label}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Out for delivery ({inFlight.length})</h2></div>
        {inFlight.length === 0 ? (
          <div className="empty-state">Nothing currently with a driver.</div>
        ) : (
          <table>
            <thead><tr><th>Order</th><th>Total</th><th>Progress</th></tr></thead>
            <tbody>
              {inFlight.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id.slice(0, 8)}</td>
                  <td className="mono">{formatUSD(o.total_amount)}</td>
                  <td><OrderRail status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="panel-header"><h2>History</h2></div>
        {history.length === 0 ? (
          <div className="empty-state">No completed orders yet.</div>
        ) : (
          <table>
            <thead><tr><th>Order</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {history.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id.slice(0, 8)}</td>
                  <td className="mono">{formatUSD(o.total_amount)}</td>
                  <td><OrderRail status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
