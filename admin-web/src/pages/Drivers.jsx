import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

function statusPill(status) {
  const map = { approved: 'live', pending: 'pending', rejected: 'danger' };
  return <span className={`pill ${map[status] || 'neutral'}`}>{status || 'unknown'}</span>;
}

const VEHICLE_ORDER = ['car', 'motorcycle', 'bicycle', 'scooter'];

function vehicleLabel(type) {
  if (!type) return 'Unspecified';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function Drivers() {
  const [drivers, setDrivers] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/admin/drivers')
      .then((res) => setDrivers(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load drivers'));
  }, []);

  const filtered = drivers?.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.phone?.includes(q) || d.email?.toLowerCase().includes(q);
  }) || [];

  // Group by vehicle_type, with known types shown first in a sensible order,
  // then any unexpected/unspecified types after.
  const grouped = {};
  filtered.forEach((d) => {
    const key = d.vehicle_type || 'unspecified';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  });
  const knownKeys = VEHICLE_ORDER.filter((k) => grouped[k]);
  const otherKeys = Object.keys(grouped).filter((k) => !VEHICLE_ORDER.includes(k));
  const orderedKeys = [...knownKeys, ...otherKeys];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Drivers</h1>
          <p>All registered drivers, sectioned by vehicle type</p>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div className="panel-header">
          <h2>{drivers ? `${filtered.length} driver${filtered.length === 1 ? '' : 's'}` : 'Loading...'}</h2>
          <input
            placeholder="Search by phone or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
        </div>
      </div>

      {drivers && filtered.length === 0 && (
        <div className="panel"><div className="empty-state">No drivers match.</div></div>
      )}

      {orderedKeys.map((key) => (
        <div className="panel" key={key}>
          <div className="panel-header">
            <h2>{vehicleLabel(key)} ({grouped[key].length})</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Phone</th>
                <th>Email</th>
                <th>Verification</th>
                <th>Account</th>
                <th>Available</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {grouped[key].map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.phone}</td>
                  <td>{d.email || '—'}</td>
                  <td>{statusPill(d.verification_status)}</td>
                  <td>{statusPill(d.account_status === 'active' ? 'approved' : d.account_status)}</td>
                  <td>{d.is_available ? 'Yes' : 'No'}</td>
                  <td><Link to={`/drivers/${d.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
