import { useEffect, useState } from 'react';
import api from '../api';
import OrderRail from '../components/OrderRail';

export default function LiveMap() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/admin/live-map')
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load live map'));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000); // poll for near-live updates
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Live map</h1>
          <p>Online drivers and orders currently in motion — refreshes every 8s</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div className="panel-header"><h2>Online drivers ({data?.drivers.length ?? '…'})</h2></div>
        {data && data.drivers.length === 0 ? (
          <div className="empty-state">No drivers online right now.</div>
        ) : (
          <table>
            <thead><tr><th>Phone</th><th>Vehicle</th><th>Status</th><th>Location</th><th>Last update</th></tr></thead>
            <tbody>
              {data?.drivers.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.phone}</td>
                  <td style={{ textTransform: 'capitalize' }}>{d.vehicle_type}</td>
                  <td>
                    <span className="pill live"><span className="dot" style={{ color: 'var(--accent-live)' }} />{d.is_available ? 'Available' : 'On delivery'}</span>
                  </td>
                  <td className="mono">{Number(d.current_lat).toFixed(4)}, {Number(d.current_lng).toFixed(4)}</td>
                  <td>{d.last_location_update ? new Date(d.last_location_update).toLocaleTimeString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Active orders ({data?.active_orders.length ?? '…'})</h2></div>
        {data && data.active_orders.length === 0 ? (
          <div className="empty-state">No orders in progress right now.</div>
        ) : (
          <table>
            <thead><tr><th>Order</th><th>Seller</th><th>Progress</th></tr></thead>
            <tbody>
              {data?.active_orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id.slice(0, 8)}</td>
                  <td>{o.business_name}</td>
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
