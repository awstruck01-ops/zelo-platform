import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const formatUSD = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyForm = { name: '', description: '', price: '', category: 'food', stock_qty: '', weight_class: 'light' };

export default function Catalog() {
  const { profile } = useAuth();
  const sellerId = profile?.profile?.id;
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    if (!sellerId) return;
    api.get(`/sellers/${sellerId}/items`)
      .then((res) => setItems(res.data.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load catalog'));
  };

  useEffect(() => { load(); }, [sellerId]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/sellers/${sellerId}/items`, {
        ...form,
        price: parseFloat(form.price),
        stock_qty: form.stock_qty ? parseInt(form.stock_qty) : 0,
      });
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add item');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAvailability = async (item) => {
    setBusyId(item.id);
    try {
      await api.patch(`/sellers/${sellerId}/items/${item.id}`, { is_available: !item.is_available });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Catalog</h1>
          <p>What customers see on your storefront</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div className="panel-header"><h2>Add an item</h2></div>
        <form onSubmit={submit} style={{ padding: 20, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div className="field">
            <label>Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jollof Rice + Chicken" />
          </div>
          <div className="field">
            <label>Price ($)</label>
            <input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div className="field">
            <label>Stock qty</label>
            <input type="number" min="0" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} placeholder="0 = unlimited" />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="food">Food</option>
              <option value="grocery">Grocery</option>
              <option value="produce">Produce</option>
              <option value="retail">Retail</option>
            </select>
          </div>
          <button type="submit" className="primary" disabled={submitting}>{submitting ? 'Adding…' : 'Add item'}</button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Your items ({items.length})</h2></div>
        {items.length === 0 ? (
          <div className="empty-state">No items yet — add your first one above.</div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Price</th><th>Stock</th><th>Category</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="mono">{formatUSD(item.price)}</td>
                  <td className="mono">{item.stock_qty}</td>
                  <td style={{ textTransform: 'capitalize' }}>{item.category}</td>
                  <td><span className={`pill ${item.is_available ? 'live' : 'neutral'}`}>{item.is_available ? 'Available' : 'Hidden'}</span></td>
                  <td>
                    <button disabled={busyId === item.id} onClick={() => toggleAvailability(item)}>
                      {item.is_available ? 'Hide' : 'Show'}
                    </button>
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
