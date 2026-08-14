import { Link } from 'react-router-dom';

export default function StripeRefresh() {
  return (
    <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
      <h1>That link expired</h1>
      <p style={{ color: 'var(--text-dim)' }}>
        Your bank account setup link timed out before you finished. No problem —
        head back to Earnings and click "Connect bank account" again to get a fresh link.
      </p>
      <Link to="/" className="primary" style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', marginTop: 16 }}>
        Back to dashboard
      </Link>
    </div>
  );
}
