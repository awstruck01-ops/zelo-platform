import { useState, useRef } from 'react';

const POLICY_SECTIONS = [
  {
    title: '1. Driver Role Limitation',
    body: [
      'The seller acknowledges that delivery drivers are independent delivery personnel whose sole responsibility is to collect completed orders and deliver them to customers.',
      'The seller agrees that drivers shall not be required to:',
      ['Prepare food', 'Cook meals', 'Package food', 'Pour drinks', 'Fill cups with ice', 'Assemble orders', 'Handle kitchen duties', 'Wash dishes', 'Perform cleaning tasks', 'Stock inventory', 'Perform cashier duties'],
      'Orders must be fully prepared, packaged, and ready for pickup before the driver arrives.',
    ],
  },
  {
    title: '2. Order Readiness Requirement',
    body: [
      ['Sellers must prepare orders within the estimated preparation time.', 'Orders should be ready when the driver arrives.', 'Excessive delays may result in penalties, lower ranking, temporary suspension, or removal from the platform.'],
    ],
  },
  {
    title: '3. Food Safety & Compliance',
    body: [
      'Seller agrees to:',
      ['Maintain all required business licenses.', 'Maintain all required food permits.', 'Follow local health department regulations.', 'Comply with food handling and sanitation standards.', 'Ensure food is safe for consumption.'],
      'The platform is not responsible for food contamination caused by the seller.',
    ],
  },
  {
    title: '4. Accurate Menu Information',
    body: [
      'Seller must provide accurate information regarding:',
      ['Pricing', 'Ingredients', 'Allergens', 'Portion sizes', 'Availability', 'Photos (if used)'],
      'Misleading information may result in account suspension.',
    ],
  },
  {
    title: '5. Packaging Standards',
    body: [
      'Seller agrees to:',
      ['Properly package all food items.', 'Use leak-resistant containers.', 'Secure beverages.', 'Seal orders when possible.', 'Label orders accurately.'],
      'The seller is responsible for damages caused by improper packaging.',
    ],
  },
  {
    title: '6. Inventory Accuracy',
    body: [
      ['Sellers must keep menu availability updated.', 'Out-of-stock items should be marked unavailable immediately.', 'Repeated order cancellations due to unavailable items may result in penalties.'],
    ],
  },
  {
    title: '7. Professional Conduct',
    body: [
      'Seller agrees to treat:',
      ['Customers', 'Drivers', 'Platform staff'],
      'with professionalism and respect. Abusive, threatening, discriminatory, or harassing behavior may result in immediate suspension.',
    ],
  },
  {
    title: '8. No Driver Solicitation',
    body: [
      'Seller shall not:',
      ['Recruit drivers away from the platform.', 'Offer off-platform delivery arrangements.', 'Encourage drivers to bypass the platform.'],
    ],
  },
  {
    title: '9. No Cash Collection Unless Authorized',
    body: [
      'Sellers may only collect payment methods approved by the platform. Unauthorized cash transactions are prohibited.',
    ],
  },
  {
    title: '10. Pricing Integrity',
    body: [
      'Seller agrees not to:',
      ['Manipulate prices after orders are placed.', 'Add hidden fees.', 'Charge customers outside the platform without authorization.'],
    ],
  },
  {
    title: '11. Refund & Dispute Cooperation',
    body: [
      'Seller agrees to cooperate with investigations involving:',
      ['Missing items', 'Incorrect orders', 'Food quality complaints', 'Customer disputes'],
    ],
  },
  {
    title: '12. Driver Waiting Time',
    body: [
      'If a driver arrives and the order is not ready:',
      ['The platform may charge a wait-time fee.', 'Repeated excessive wait times may result in penalties.'],
    ],
  },
  {
    title: '13. Pickup Procedures',
    body: [
      'Seller agrees to:',
      ['Verify pickup details before releasing orders.', 'Hand orders only to authorized drivers.', 'Not release food to unauthorized persons.'],
    ],
  },
  {
    title: '14. Fraud Prevention',
    body: [
      'Seller shall not:',
      ['Create fake orders.', 'Manipulate ratings.', 'Generate fraudulent transactions.', 'Use the platform for illegal activities.'],
      'Violation may result in permanent termination.',
    ],
  },
  {
    title: '15. Right to Suspend or Remove',
    body: [
      'The platform reserves the right to suspend or terminate seller accounts for:',
      ['Food safety violations', 'Fraud', 'Repeated customer complaints', 'Driver abuse', 'Regulatory violations', 'Breach of agreement'],
    ],
  },
  {
    title: '16. Indemnification',
    body: [
      'Seller agrees to be responsible for claims arising from:',
      ['Food preparation', 'Food contamination', 'Mislabeling', 'Allergic reactions', 'Health code violations'],
    ],
  },
  {
    title: '17. Customer Data Protection',
    body: [
      'Seller may not:',
      ['Sell customer information.', 'Share customer information.', 'Use customer information for unauthorized marketing.'],
    ],
  },
  {
    title: '18. Platform Reputation Clause',
    body: [
      'Seller agrees not to engage in conduct that damages the reputation of the platform, including:',
      ['Public misrepresentation', 'Fraudulent practices', 'False advertising', 'Repeated service failures'],
    ],
  },
  {
    title: '19. Acceptance of Ratings & Reviews',
    body: [
      'Customers may leave ratings and reviews. Sellers may not:',
      ['Manipulate reviews', 'Offer incentives for positive reviews', 'Threaten customers regarding reviews'],
    ],
  },
  {
    title: '20. Commission & Fees',
    body: [
      'Seller agrees to pay applicable transaction fees, delivery commissions, and subscription fees (if applicable) as outlined in the Seller Pricing Schedule.',
    ],
  },
];

export default function PolicyModal({ open, onAgree, onClose }) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const scrollRef = useRef(null);

  if (!open) return null;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom) setScrolledToBottom(true);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          color: '#111',
        }}
      >
        <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid #eee' }}>
          <h2 style={{ margin: 0, fontSize: 20, color: '#111' }}>Seller Agreement &amp; Responsibilities</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.7, color: '#333' }}>
            Please read the full agreement below. Scroll to the bottom to unlock "I Agree."
          </p>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ overflowY: 'auto', padding: '16px 24px', flex: 1 }}
        >
          {POLICY_SECTIONS.map((section, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, marginBottom: 6, color: '#111' }}>{section.title}</h3>
              {section.body.map((part, j) =>
                Array.isArray(part) ? (
                  <ul key={j} style={{ margin: '4px 0 8px', paddingLeft: 20, fontSize: 14, opacity: 0.85, color: '#222' }}>
                    {part.map((item, k) => (
                      <li key={k}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={j} style={{ fontSize: 14, opacity: 0.85, margin: '4px 0', color: '#222' }}>
                    {part}
                  </p>
                )
              )}
            </div>
          ))}
          <p style={{ fontSize: 13, opacity: 0.6, textAlign: 'center', marginTop: 8, color: '#555' }}>
            — End of agreement —
          </p>
        </div>

        <div style={{ padding: '12px 24px 20px', borderTop: '1px solid #eee', display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #ccc', background: 'transparent', color: '#333', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAgree}
            disabled={!scrolledToBottom}
            style={{
              flex: 2, padding: '10px', borderRadius: 8, border: 'none',
              background: scrolledToBottom ? 'var(--accent-live)' : '#ccc',
              color: '#fff', fontWeight: 600,
              cursor: scrolledToBottom ? 'pointer' : 'not-allowed',
            }}
          >
            {scrolledToBottom ? 'I Agree' : 'Scroll to read full agreement'}
          </button>
        </div>
      </div>
    </div>
  );
}
