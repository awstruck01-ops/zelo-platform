import { useEffect, useState } from 'react';
import api from '../api';
import OrderRail from '../components/OrderRail';

const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Transactions() {
  const [type, setType] = useState('orders');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/admin/transactions', { params: { type } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load transactions'))
      .finally(() => setLoading(false));
  }, [type]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Transactions</h1>
          <p>Every order, payment, and withdrawal moving through the platform</p>
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="orders">Orders</option>
          <option value="payments">Payments</option>
          <option value="withdrawals">Withdrawals</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No {type} yet.</div>
        ) : type === 'orders' ? (
          <table>
            <thead><tr><th>Order</th><th>Total</th><th>Delivery fee</th><th>Tax</th><th>Distance</th><th>Progress</th><th>Placed</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id.slice(0, 8)}</td>
                  <td className="mono">{formatUSD(o.total_amount)}</td>
                  <td className="mono">{formatUSD(o.delivery_fee)}</td>
                  <td className="mono">{formatUSD(o.tax_amount)}</td>
                  <td className="mono">{Number(o.distance_mi).toFixed(1)} mi</td>
                  <td><OrderRail status={o.status} /></td>
                  <td>{o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : type === 'payments' ? (
          <table>
            <thead><tr><th>Reference</th><th>Method</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.processor_ref}</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.method}</td>
                  <td className="mono">{formatUSD(p.amount)}</td>
                  <td><span className={`pill ${p.status === 'paid' ? 'live' : p.status === 'pending' ? 'pending' : 'danger'}`}>{p.status}</span></td>
                  <td>{new Date(p.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>Amount</th><th>Fee</th><th>Status</th><th>Requested</th></tr></thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td className="mono">{formatUSD(w.amount)}</td>
                  <td className="mono">{formatUSD(w.fee)}</td>
                  <td><span className={`pill ${w.status === 'completed' ? 'live' : w.status === 'processing' ? 'pending' : 'danger'}`}>{w.status}</span></td>
                  <td>{new Date(w.requested_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
