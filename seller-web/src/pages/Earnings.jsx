import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Earnings() {
  const { profile } = useAuth();
  const sellerId = profile?.profile?.id;
  const [earnings, setEarnings] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [bankForm, setBankForm] = useState({ bank_name: '', account_number: '', account_name: '' });
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!sellerId) return;
    api.get(`/sellers/${sellerId}/earnings`).then((res) => setEarnings(res.data.data)).catch(() => {});
    api.get('/wallet/me').then((res) => {
      setWallet(res.data.data.wallet);
      setTransactions(res.data.data.transactions);
    }).catch((err) => setError(err.response?.data?.error || 'Failed to load wallet'));
    api.get('/wallet/me/bank-accounts').then((res) => {
      setBankAccounts(res.data.data);
      if (res.data.data.length > 0) setSelectedBankId(res.data.data[0].id);
    }).catch(() => {});
  };

  useEffect(() => { load(); }, [sellerId]);

  const addBank = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/wallet/me/bank-account', bankForm);
      setBankForm({ bank_name: '', account_number: '', account_name: '' });
      setMessage('Bank account saved');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save bank account');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await api.post('/wallet/me/withdraw', {
        amount: parseFloat(withdrawAmount),
        bank_account_id: selectedBankId,
      });
      setMessage(`Withdrawal ${res.data.data.status} — funds are on the way`);
      setWithdrawAmount('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Withdrawal failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Earnings</h1>
          <p>Track sales and cash out to your bank anytime</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {message && <div className="pill live" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Wallet balance</div>
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

      <div className="panel">
        <div className="panel-header"><h2>Withdraw funds</h2></div>
        <div style={{ padding: 20 }}>
          {bankAccounts.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Add a bank account below before withdrawing.</p>
          ) : (
            <form onSubmit={withdraw} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
              <div className="field">
                <label>Amount ($)</label>
                <input type="number" min="500" required value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
              </div>
              <div className="field">
                <label>To account</label>
                <select value={selectedBankId} onChange={(e) => setSelectedBankId(e.target.value)}>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>{b.bank_name} •••• {b.account_number.slice(-4)}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="primary" disabled={busy}>{busy ? 'Processing…' : 'Withdraw'}</button>
            </form>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Bank account</h2></div>
        <form onSubmit={addBank} style={{ padding: 20, display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="field">
            <label>Bank name</label>
            <input required value={bankForm.bank_name} onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })} placeholder="GTBank" />
          </div>
          <div className="field">
            <label>Account number</label>
            <input required value={bankForm.account_number} onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })} />
          </div>
          <div className="field">
            <label>Account name</label>
            <input required value={bankForm.account_name} onChange={(e) => setBankForm({ ...bankForm, account_name: e.target.value })} />
          </div>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save account'}</button>
        </form>
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
