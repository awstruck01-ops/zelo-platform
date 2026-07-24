import { useEffect, useState } from 'react';
import api from '../api';

const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Overview() {
  const [revenue, setRevenue] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/admin/revenue'), api.get('/admin/verifications/pending')])
      .then(([revRes, pendingRes]) => {
        setRevenue(revRes.data.data);
        setPending(pendingRes.data.data);
      })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load overview'));
  }, []);

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
    </>
  );
}
