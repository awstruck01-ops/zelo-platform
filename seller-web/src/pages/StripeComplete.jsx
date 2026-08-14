import { Link } from 'react-router-dom';

export default function StripeComplete() {
  return (
    <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
      <h1>Bank account setup complete</h1>
      <p style={{ color: 'var(--text-dim)' }}>
        Stripe is verifying your details now — this usually takes a few minutes.
        Once it's done, payouts will happen automatically after each completed order.
      </p>
      <Link to="/" className="primary" style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', marginTop: 16 }}>
        Back to dashboard
      </Link>
    </div>
  );
}
