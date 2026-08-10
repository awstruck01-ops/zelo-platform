import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
export default function Disputes() {
  const [disputes, setDisputes] = useState([]);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState(null);
  const load = () => {
    api.get('/disputes')
      .then((res) => setDisputes(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load disputes'));
  };
  useEffect(() => { load(); }, []);
  const resolve = async (id, status) => {
    setBusyId(id);
    try {
      await api.patch(`/disputes/${id}/resolve`, { status, resolution_note: notes[id] || '' });
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
          <h1>Disputes</h1>
          <p>Complaints raised by customers, sellers, or drivers</p>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="panel">
        {disputes.length === 0 ? (
          <div className="empty-state">No disputes filed.</div>
        ) : (
          <table>
            <thead><tr><th>Order</th><th>Reason</th><th>Status</th><th>Resolution note</th><th /></tr></thead>
            <tbody>
              {disputes.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.order_id.slice(0, 8)}</td>
                  <td>{d.reason}</td>
                  <td><span className={`pill ${d.status === 'pending' ? 'pending' : d.status === 'resolved' ? 'live' : 'danger'}`}>{d.status}</span></td>
                  <td>
                    {d.status === 'pending' ? (
                      <input
                        placeholder="Add a note…"
                        value={notes[d.id] || ''}
                        onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })}
                      />
                    ) : (d.resolution_note || '—')}
                  </td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <Link to={`/messages?order_id=${d.order_id}`} className="secondary" style={{ alignSelf: 'center' }}>
                      View chat
                    </Link>
                    {d.status === 'pending' && (
                      <>
                        <button className="primary" disabled={busyId === d.id} onClick={() => resolve(d.id, 'resolved')}>Resolve</button>
                        <button className="danger" disabled={busyId === d.id} onClick={() => resolve(d.id, 'rejected')}>Reject</button>
                      </>
                    )}
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
