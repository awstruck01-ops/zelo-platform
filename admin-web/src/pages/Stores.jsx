import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

function statusPill(status) {
  const map = { approved: 'live', pending: 'pending', rejected: 'danger' };
  return <span className={`pill ${map[status] || 'neutral'}`}>{status || 'unknown'}</span>;
}

export default function Stores() {
  const [sellers, setSellers] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/admin/sellers')
      .then((res) => setSellers(res.data.data.filter((s) => (s.category || 'restaurant') !== 'restaurant')))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load stores'));
  }, []);

  const filtered = sellers?.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.business_name?.toLowerCase().includes(q) || s.phone?.includes(q) || s.address?.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Stores</h1>
          <p>All registered non-restaurant sellers (grocery, retail, pharmacy, etc.)</p>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div className="panel-header">
          <h2>{filtered ? `${filtered.length} store${filtered.length === 1 ? '' : 's'}` : 'Loading...'}</h2>
          <input
            placeholder="Search by name, phone, or address"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
        </div>
        {filtered && filtered.length === 0 ? (
          <div className="empty-state">No stores match.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Storefront</th>
                <th>Business</th>
                <th>Category</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Verification</th>
                <th>Account</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered?.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.image_url ? (
                      <img src={s.image_url} alt={s.business_name} style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 6, border: '1px dashed #444' }} />
                    )}
                  </td>
                  <td>{s.business_name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{s.category}</td>
                  <td className="mono">{s.phone}</td>
                  <td>{s.address}</td>
                  <td>{statusPill(s.verification_status)}</td>
                  <td>{statusPill(s.account_status === 'active' ? 'approved' : s.account_status)}</td>
                  <td><Link to={`/sellers/${s.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
