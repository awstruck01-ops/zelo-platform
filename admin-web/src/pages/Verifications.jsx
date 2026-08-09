import { useEffect, useState } from 'react';
import api from '../api';

function DocThumb({ url, label, onOpen }) {
  if (!url) {
    return (
      <div style={{ fontSize: 12, opacity: 0.5, width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #444', borderRadius: 6 }}>
        None
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={label}
      onClick={() => onOpen(url, label)}
      style={{ width: 56, height: 56, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', border: '1px solid #333' }}
    />
  );
}

function Lightbox({ doc, onClose }) {
  if (!doc) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, cursor: 'zoom-out', padding: 24,
      }}
    >
      <div style={{ color: '#fff', marginBottom: 12, fontSize: 14, opacity: 0.85 }}>{doc.label} — click anywhere to close</div>
      <img
        src={doc.url}
        alt={doc.label}
        style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }}
      />
    </div>
  );
}

export default function Verifications() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [lightboxDoc, setLightboxDoc] = useState(null);
  const [taxSubmissions, setTaxSubmissions] = useState([]);
  const [driverTaxSubmissions, setDriverTaxSubmissions] = useState([]);

  const load = () => {
    api.get('/admin/verifications/pending')
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load'));
  };

  const loadTaxSubmissions = () => {
    api.get('/admin/sellers/tax-submissions')
      .then((res) => setTaxSubmissions(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load tax submissions'));
  };

  const loadDriverTaxSubmissions = () => {
    api.get('/admin/tax-submissions')
      .then((res) => setDriverTaxSubmissions(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load driver tax submissions'));
  };

  useEffect(() => {
    load();
    loadTaxSubmissions();
    loadDriverTaxSubmissions();
  }, []);

  const openDoc = (url, label) => setLightboxDoc({ url, label });

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
            <thead>
              <tr>
                <th>Storefront</th>
                <th>Business License</th>
                <th>Owner ID</th>
                <th>Owner ID (Back)</th>
                <th>Business</th>
                <th>Category</th>
                <th>Phone</th>
                <th>Address</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.sellers.map((s) => (
                <tr key={s.id}>
                  <td><DocThumb url={s.image_url} label={`${s.business_name} — Storefront`} onOpen={openDoc} /></td>
                  <td><DocThumb url={s.business_license_url} label={`${s.business_name} — Business License`} onOpen={openDoc} /></td>
                  <td><DocThumb url={s.id_document_url} label={`${s.business_name} — Owner ID`} onOpen={openDoc} /></td>
                  <td><DocThumb url={s.id_document_back_url} label={`${s.business_name} — Owner ID (Back)`} onOpen={openDoc} /></td>
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
        <div className="panel-header"><h2>Seller tax submissions (W-9)</h2></div>
        {taxSubmissions.length === 0 ? (
          <div className="empty-state">No submissions yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Phone</th>
                <th>Form Version</th>
                <th>Submitted</th>
                <th>Signed</th>
                <th>Prefilled W-9</th>
                <th>Signed W-9</th>
              </tr>
            </thead>
            <tbody>
              {taxSubmissions.map((t) => (
                <tr key={t.id}>
                  <td>{t.business_name}</td>
                  <td className="mono">{t.phone}</td>
                  <td>{t.version_label || '—'}</td>
                  <td>{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
                  <td>{t.signed_at ? new Date(t.signed_at).toLocaleDateString() : '—'}</td>
                  <td>
                    {t.prefilled_pdf_url ? (
                      <a href={t.prefilled_pdf_url} target="_blank" rel="noreferrer">View</a>
                    ) : '—'}
                  </td>
                  <td>
                    {t.signed_pdf_url ? (
                      <a href={t.signed_pdf_url} target="_blank" rel="noreferrer">View</a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Driver tax submissions (W-9)</h2></div>
        {driverTaxSubmissions.length === 0 ? (
          <div className="empty-state">No submissions yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Legal Name</th>
                <th>Phone</th>
                <th>Form Version</th>
                <th>Submitted</th>
                <th>Signed</th>
                <th>Prefilled W-9</th>
                <th>Signed W-9</th>
              </tr>
            </thead>
            <tbody>
              {driverTaxSubmissions.map((t) => (
                <tr key={t.id}>
                  <td>{t.legal_name}{t.business_name ? ` (${t.business_name})` : ''}</td>
                  <td className="mono">{t.phone}</td>
                  <td>{t.version_label || '—'}</td>
                  <td>{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
                  <td>{t.signed_at ? new Date(t.signed_at).toLocaleDateString() : (t.signed_pdf_url ? 'Yes' : '—')}</td>
                  <td>
                    {t.prefilled_pdf_url ? (
                      <a href={t.prefilled_pdf_url} target="_blank" rel="noreferrer">View</a>
                    ) : '—'}
                  </td>
                  <td>
                    {t.signed_pdf_url ? (
                      <a href={t.signed_pdf_url} target="_blank" rel="noreferrer">View</a>
                    ) : '—'}
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
            <thead>
              <tr>
                <th>License</th>
                <th>Insurance</th>
                <th>Selfie</th>
                <th>Vehicle</th>
                <th>Phone</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.drivers.map((d) => (
                <tr key={d.id}>
                  <td><DocThumb url={d.license_url} label={`${d.phone} — License`} onOpen={openDoc} /></td>
                  <td><DocThumb url={d.insurance_doc_url} label={`${d.phone} — Insurance`} onOpen={openDoc} /></td>
                  <td><DocThumb url={d.selfie_url} label={`${d.phone} — Selfie`} onOpen={openDoc} /></td>
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

      <Lightbox doc={lightboxDoc} onClose={() => setLightboxDoc(null)} />
    </>
  );
}
