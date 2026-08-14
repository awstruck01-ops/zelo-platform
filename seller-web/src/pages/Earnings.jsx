import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const CLOUD_NAME = 'jwv51r23';
const UPLOAD_PRESET = 'zelo_unsigned';

const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Earnings() {
  const { profile } = useAuth();
  const sellerId = profile?.profile?.id;
  const [earnings, setEarnings] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [stripeStatus, setStripeStatus] = useState(null); // { connected, payouts_enabled }
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Tax form state
  const [taxStatus, setTaxStatus] = useState(null); // { current_version, submission_for_current_version, needs_submission }
  const [taxForm, setTaxForm] = useState({
    legal_name: '', business_name: '', tax_classification: 'individual',
    address: '', city: '', state: '', zip: '',
  });
  const [taxBusy, setTaxBusy] = useState(false);
  const [taxError, setTaxError] = useState('');
  const [uploadingSigned, setUploadingSigned] = useState(false);

  const load = () => {
    if (!sellerId) return;
    api.get(`/sellers/${sellerId}/earnings`).then((res) => setEarnings(res.data.data)).catch(() => {});
    api.get('/wallet/me').then((res) => {
      setWallet(res.data.data.wallet);
      setTransactions(res.data.data.transactions);
    }).catch((err) => setError(err.response?.data?.error || 'Failed to load wallet'));
    api.get('/sellers/me/stripe/status').then((res) => setStripeStatus(res.data.data)).catch(() => {});
  };

  const loadTaxStatus = () => {
    api.get('/sellers/me/tax-form/current')
      .then((res) => setTaxStatus(res.data.data))
      .catch((err) => setTaxError(err.response?.data?.error || 'Failed to load tax form status'));
  };

  useEffect(() => {
    load();
    loadTaxStatus();
    // Landing back here from Stripe's hosted onboarding flow — refresh
    // status so "Connected" shows up without a manual reload.
    if (window.location.pathname.includes('stripe-complete')) {
      setMessage('Bank account setup complete — verifying with Stripe...');
    }
  }, [sellerId]);

  const connectBank = async () => {
    setConnecting(true);
    setError('');
    try {
      const res = await api.post('/sellers/me/stripe/onboard');
      window.location.href = res.data.data.onboarding_url;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start bank account setup');
      setConnecting(false);
    }
  };

  const submitTaxForm = async (e) => {
    e.preventDefault();
    setTaxBusy(true);
    setTaxError('');
    try {
      await api.post('/sellers/me/tax-form/submit', taxForm);
      loadTaxStatus();
    } catch (err) {
      setTaxError(err.response?.data?.error || 'Failed to submit tax form');
    } finally {
      setTaxBusy(false);
    }
  };

  const uploadSignedCopy = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const submissionId = taxStatus?.submission_for_current_version?.id;
    if (!submissionId) return;

    setUploadingSigned(true);
    setTaxError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      if (!data.secure_url) {
        setTaxError('Upload failed. Please try again.');
        return;
      }
      await api.patch(`/sellers/me/tax-form/${submissionId}/attach-signed`, {
        signed_pdf_url: data.secure_url,
      });
      loadTaxStatus();
    } catch (err) {
      setTaxError('Upload failed. Please try again.');
    } finally {
      setUploadingSigned(false);
    }
  };

  const submission = taxStatus?.submission_for_current_version;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Earnings</h1>
          <p>Track sales — Zelo pays out automatically as each order completes</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="pill live" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total paid out</div>
          <div className="value">{formatUSD(wallet?.balance)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Gross sales</div>
          <div className="value">{formatUSD(earnings?.gross_sales)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total earned (after commission)</div>
          <div className="value">{formatUSD(earnings?.total_earned)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Completed orders</div>
          <div className="value">{earnings?.completed_orders ?? 0}</div>
        </div>
      </div>

      <div className="panel" id="tax-info">
        <div className="panel-header"><h2>Tax information</h2></div>
        <div style={{ padding: 20 }}>
          {taxError && <div className="error-banner">{taxError}</div>}

          {!taxStatus ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>
          ) : !taxStatus.current_version ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No tax form is currently required.</p>
          ) : !submission ? (
            <form onSubmit={submitTaxForm} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
              <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0 }}>
                Fill in the details below to generate a prefilled W-9. You'll download it,
                add your SSN/EIN and signature by hand, then upload the completed copy —
                your tax ID is never entered on this site.
              </p>
              <div className="field">
                <label>Legal name</label>
                <input required value={taxForm.legal_name} onChange={(e) => setTaxForm({ ...taxForm, legal_name: e.target.value })} />
              </div>
              <div className="field">
                <label>Business name (if different)</label>
                <input value={taxForm.business_name} onChange={(e) => setTaxForm({ ...taxForm, business_name: e.target.value })} />
              </div>
              <div className="field">
                <label>Tax classification</label>
                <select value={taxForm.tax_classification} onChange={(e) => setTaxForm({ ...taxForm, tax_classification: e.target.value })}>
                  <option value="individual">Individual / Sole proprietor</option>
                  <option value="c_corp">C corporation</option>
                  <option value="s_corp">S corporation</option>
                  <option value="partnership">Partnership</option>
                  <option value="trust_estate">Trust / Estate</option>
                  <option value="llc">LLC</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="field">
                <label>Address</label>
                <input required value={taxForm.address} onChange={(e) => setTaxForm({ ...taxForm, address: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>City</label>
                  <input required value={taxForm.city} onChange={(e) => setTaxForm({ ...taxForm, city: e.target.value })} />
                </div>
                <div className="field" style={{ width: 90 }}>
                  <label>State</label>
                  <input required value={taxForm.state} onChange={(e) => setTaxForm({ ...taxForm, state: e.target.value })} />
                </div>
                <div className="field" style={{ width: 110 }}>
                  <label>ZIP</label>
                  <input required value={taxForm.zip} onChange={(e) => setTaxForm({ ...taxForm, zip: e.target.value })} />
                </div>
              </div>
              <button type="submit" className="primary" disabled={taxBusy} style={{ alignSelf: 'flex-start' }}>
                {taxBusy ? 'Submitting…' : 'Generate prefilled W-9'}
              </button>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
              <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0 }}>
                Your details are on file. Download your prefilled W-9, fill in your SSN/EIN
                and signature by hand, then upload the completed copy below.
              </p>
              {submission.prefilled_pdf_url && (
                <a href={submission.prefilled_pdf_url} target="_blank" rel="noreferrer" className="primary" style={{ display: 'inline-block', width: 'fit-content', padding: '10px 16px', borderRadius: 8, textDecoration: 'none' }}>
                  Download prefilled W-9
                </a>
              )}
              {submission.signed_pdf_url ? (
                <p style={{ color: 'var(--accent-live)', fontSize: 13 }}>✅ Signed copy uploaded</p>
              ) : (
                <div className="field">
                  <label>Upload signed copy</label>
                  <input type="file" accept="application/pdf,image/*" onChange={uploadSignedCopy} disabled={uploadingSigned} />
                  {uploadingSigned && <p style={{ fontSize: 13, opacity: 0.7 }}>Uploading...</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Payouts</h2></div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0 }}>
            Zelo pays out automatically as soon as each order is completed — your bank
            details are entered directly with Stripe and never stored on Zelo's servers.
          </p>

          {!stripeStatus ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Checking payout status...</p>
          ) : stripeStatus.payouts_enabled ? (
            <div className="pill live" style={{ width: 'fit-content' }}>✅ Bank account connected — payouts active</div>
          ) : stripeStatus.connected ? (
            <>
              <div className="pill pending" style={{ width: 'fit-content' }}>⚠️ Setup started but not finished</div>
              <button className="primary" onClick={connectBank} disabled={connecting} style={{ alignSelf: 'flex-start' }}>
                {connecting ? 'Redirecting...' : 'Finish bank account setup'}
              </button>
            </>
          ) : (
            <>
              <div className="pill neutral" style={{ width: 'fit-content' }}>Not connected yet</div>
              <button className="primary" onClick={connectBank} disabled={connecting} style={{ alignSelf: 'flex-start' }}>
                {connecting ? 'Redirecting...' : 'Connect bank account'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Recent wallet activity</h2></div>
        {transactions.length === 0 ? (
          <div className="empty-state">No transactions yet.</div>
        ) : (
          <table>
            <thead><tr><th>Type</th><th>Amount</th><th>Description</th><th>Date</th></tr></thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td style={{ textTransform: 'capitalize' }}>{t.type.replace(/_/g, ' ')}</td>
                  <td className="mono" style={{ color: t.amount < 0 ? 'var(--accent-danger)' : 'var(--accent-live)' }}>
                    {t.amount < 0 ? '-' : '+'}{formatUSD(Math.abs(t.amount))}
                  </td>
                  <td>{t.description || '—'}</td>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
