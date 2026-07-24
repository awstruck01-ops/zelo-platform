const STAGES = [
  'placed', 'payment_confirmed', 'preparing', 'driver_searching',
  'driver_assigned', 'picked_up', 'delivered', 'completed',
];

const TERMINAL_BAD = ['cancelled', 'disputed'];

export default function OrderRail({ status }) {
  if (TERMINAL_BAD.includes(status)) {
    return <span className={`pill ${status === 'disputed' ? 'danger' : 'neutral'}`}>{status}</span>;
  }

  const currentIndex = status === 'completed' ? STAGES.length : STAGES.indexOf(status);

  return (
    <div className="rail" title={status}>
      {STAGES.map((stage, i) => (
        <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
          <div
            className={`rail-dot ${i < currentIndex ? 'done' : i === currentIndex ? 'current' : ''}`}
          />
          {i < STAGES.length - 1 && <div className={`rail-line ${i < currentIndex ? 'done' : ''}`} />}
        </div>
      ))}
    </div>
  );
}
