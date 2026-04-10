import '@/core-store/components/store-grid.css';

export default function StoreLoading() {
  return (
    <div className="app-container py-12">
      <div className="skeleton-line" style={{ width: '8rem', height: '2rem', marginBottom: '0.375rem' }} />
      <div className="skeleton-line" style={{ width: '14rem', marginBottom: '2rem' }} />
      <div className="store-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="product-card" style={{ pointerEvents: 'none' }}>
            <div className="product-card-image"><div className="skeleton-box" /></div>
            <div className="product-card-body">
              <div className="skeleton-line" style={{ width: '70%' }} />
              <div className="skeleton-line" style={{ width: '40%', marginTop: '0.25rem' }} />
              <div className="skeleton-line" style={{ width: '30%', marginTop: 'auto' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
