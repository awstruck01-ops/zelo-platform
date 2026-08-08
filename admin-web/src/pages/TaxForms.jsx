import { useEffect, useState } from 'react';
import api from '../api';

export default function TaxForms() {
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ version_label: '', notes: '' });

  const load = () => {
    api.get('/admin/tax-forms')
      .then((res) => setVersions(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load tax form versions'));
  };
  useEffect(() => { load(); }, []);

  const publish = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.post('/admin/tax-forms', form);
      setMessage('New tax form version published — all sellers and drivers have been notified.');
      setForm({ version_label: '', notes: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to publish tax form version');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Tax Forms</h1>
          <p>Publish new tax form versions for sellers and drivers to complete</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="pill live" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="panel">
        <div className="panel-header"><h2>Publish new version</h2></div>
        <form onSubmit={publish} style={{ padding: 20, display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="field">
            <label>Version label</label>
            <input
              required
              value={form.version_label}
              onChange={(e) => setForm({ ...form, version_label: e.target.value })}
              placeholder="2027 W-9"
            />
          </div>
          <div className="field" style={{ minWidth: 280 }}>
            <label>Notes (optional)</label>
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Sent to every seller and driver's inbox"
            />
          </div>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Publishing…' : 'Publish version'}
          </button>
        </form>
        <p style={{ padding: '0 20px 16px', fontSize: 13, color: 'var(--text-dim)' }}>
          Publishing marks this as the current version, broadcasts an inbox message to every
          seller and driver, and prompts anyone without a submission for this version to complete it.
        </p>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Version history</h2></div>
        {versions.length === 0 ? (
          <div className="empty-state">No tax form versions yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Notes</th>
                <th>Status</th>
                <th>Published</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>{v.version_label}</td>
                  <td>{v.notes || '—'}</td>
                  <td>
                    {v.is_current ? (
                      <span className="pill live">Current</span>
                    ) : (
                      <span className="pill pending">Past</span>
                    )}
                  </td>
                  <td>{new Date(v.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
