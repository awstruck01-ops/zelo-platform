import { useEffect, useState } from 'react';
import api from '../api';
import OrderRail from '../components/OrderRail';

const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}

export default function Transactions() {
  const [type, setType] = useState('orders');
  const [rows, setRows] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/admin/transactions', { params: { type } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load transactions'))
      .finally(() => setLoading(false));
  }, [type]);

  useEffect(() => {
    api.get('/admin/revenue')
      .then((res) => setRevenue(res.data.data))
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Transactions</h1>
          <p>Every order, payment, and payout moving through the platform</p>
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="orders">Orders</option>
          <option value="payments">Payments</option>
          <option value="payouts">Payouts</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Revenue breakdown — what Zelo keeps vs. what sellers/drivers earn.
          Tips are shown for visibility but deliberately excluded from
          "Platform revenue" since 100% of every tip passes straight to
          the driver. */}
      <div className="panel">
        <div className="panel-header"><h2>Revenue breakdown (completed orders)</h2></div>
        {!revenue ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, padding: '0 20px 20px' }}>
              <StatCard label="Platform revenue" value={formatUSD(revenue.total_platform_revenue)} sub="Commission + fees + margins" />
              <StatCard label="Gross transaction volume" value={formatUSD(revenue.gross_transaction_volume)} sub={`${revenue.completed_orders} completed orders`} />
              <StatCard label="Seller payouts" value={formatUSD(revenue.payouts.seller_earnings)} />
              <StatCard label="Driver payouts" value={formatUSD(revenue.payouts.driver_earnings + revenue.payouts.driver_tips)} sub={`incl. ${formatUSD(revenue.payouts.driver_tips)} tips`} />
            </div>

            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>Platform revenue breakdown</div>
              <table>
                <thead>
                  <tr>
                    <th>Seller commission</th>
                    <th>Delivery margin</th>
                    <th>Surcharge margin</th>
                    <th>Service fee</th>
                    <th>Subscriptions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono">{formatUSD(revenue.charges.commission)}</td>
                    <td className="mono">{formatUSD(revenue.charges.delivery_margin)}</td>
                    <td className="mono">{formatUSD(revenue.charges.surcharge_margin)}</td>
                    <td className="mono">{formatUSD(revenue.charges.service_fee)}</td>
                    <td className="mono">{formatUSD(revenue.charges.subscription)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
                Driver &amp; seller payouts <span style={{ opacity: 0.7 }}>(not platform revenue)</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Driver base earnings</th>
                    <th>Driver tips</th>
                    <th>Seller earnings</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono">{formatUSD(revenue.payouts.driver_earnings)}</td>
                    <td className="mono">{formatUSD(revenue.payouts.driver_tips)}</td>
                    <td className="mono">{formatUSD(revenue.payouts.seller_earnings)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No {type} yet.</div>
        ) : type === 'orders' ? (
          <table>
            <thead>
              <tr>
                <th>Order</th><th>Total</th><th>Subtotal</th><th>Delivery fee</th><th>Service fee</th>
                <th>Tax</th><th>Tip</th><th>Seller earns</th><th>Driver earns</th><th>Zelo keeps</th>
                <th>Progress</th><th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const zeloKeeps = Number(o.commission_amount || 0) + Number(o.platform_delivery_margin || 0) +
                  Number(o.surcharge_platform_margin || 0) + Number(o.service_fee || 0);
                return (
                  <tr key={o.id}>
                    <td className="mono">{o.id.slice(0, 8)}</td>
                    <td className="mono">{formatUSD(o.total_amount)}</td>
                    <td className="mono">{formatUSD(o.subtotal)}</td>
                    <td className="mono">{formatUSD(o.delivery_fee)}</td>
                    <td className="mono">{formatUSD(o.service_fee)}</td>
                    <td className="mono">{formatUSD(o.tax_amount)}</td>
                    <td className="mono">{formatUSD(o.tip_amount)}</td>
                    <td className="mono">{formatUSD(o.seller_earnings)}</td>
                    <td className="mono">{formatUSD(o.driver_earnings)}</td>
                    <td className="mono">{formatUSD(zeloKeeps)}</td>
                    <td><OrderRail status={o.status} /></td>
                    <td>{o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</td>
                  </tr>
                );
              })}
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
            <thead><tr><th>Order</th><th>Seller payout</th><th>Driver payout</th><th>Tip</th><th>Seller transfer</th><th>Driver transfer</th><th>Completed</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id.slice(0, 8)}</td>
                  <td className="mono">{formatUSD(o.seller_earnings)}</td>
                  <td className="mono">{formatUSD(o.driver_earnings)}</td>
                  <td className="mono">{formatUSD(o.tip_amount)}</td>
                  <td>{o.seller_stripe_transfer_id ? <span className="pill live">Sent</span> : <span className="pill neutral">—</span>}</td>
                  <td>{o.driver_stripe_transfer_id ? <span className="pill live">Sent</span> : <span className="pill neutral">—</span>}</td>
                  <td>{o.completed_at ? new Date(o.completed_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
