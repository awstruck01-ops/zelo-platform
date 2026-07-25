import { useEffect, useState } from 'react';
import api from '../api';

export default function Verifications() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    api.get('/admin/verifications/pending')
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load'));
  };

  useEffect(() => { load(); }, []);

  const decide = async (kind, id, status) => {
    setBusyId(id);
    try {
      await api.patch(`/admin/${kind}/${id}/verify`, { status });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Verifications</h1>
          <p>Review documents before a seller or driver goes live</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div className="panel-header"><h2>Sellers awaiting review</h2></div>
        {data && data.sellers.length === 0 ? (
          <div className="empty-state">Nothing to review.</div>
        ) : (
          <table>
            <thead><tr><th>Photo</th><th>Business</th><th>Category</th><th>Phone</th><th>Address</th><th /></tr></thead>
            <tbody>
              {data?.sellers.map((s) => (
                <tr key={s.id}>
                 <td>
                {s.image_url ? (
                  <img src={s.image_url} alt={s.business_name} style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 6, background: '#eee' }} />
                )}
              </td>
              <td>{s.business_name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{s.category}</td>
                  <td className="mono">{s.phone}</td>
                  <td>{s.address}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="primary" disabled={busyId === s.id} onClick={() => decide('sellers', s.id, 'approved')}>Approve</button>
                    <button className="danger" disabled={busyId === s.id} onClick={() => decide('sellers', s.id, 'rejected')}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Drivers awaiting review</h2></div>
        {data && data.drivers.length === 0 ? (
          <div className="empty-state">Nothing to review.</div>
        ) : (
          <table>
            <thead><tr><th>Vehicle</th><th>Phone</th><th />
            </tr></thead>
            <tbody>
              {data?.drivers.map((d) => (
                <tr key={d.id}>
                  <td style={{ textTransform: 'capitalize' }}>{d.vehicle_type}</td>
                  <td className="mono">{d.phone}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="primary" disabled={busyId === d.id} onClick={() => decide('drivers', d.id, 'approved')}>Approve</button>
                    <button className="danger" disabled={busyId === d.id} onClick={() => decide('drivers', d.id, 'rejected')}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
