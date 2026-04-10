import '@/core-store/components/store-grid.css';
import '@/core-store/components/store-detail.css';

export default function ProductLoading() {
  return (
    <div className="app-container py-12">
      <div className="skeleton-line" style={{ width: '10rem', marginBottom: '1.5rem' }} />
      <div className="product-detail">
        <div className="product-gallery">
          <div className="product-gallery-main"><div className="skeleton-box" /></div>
        </div>
        <div className="product-info">
          <div className="skeleton-line" style={{ width: '60%', height: '2rem' }} />
          <div className="skeleton-line" style={{ width: '30%', height: '1.5rem' }} />
          <div className="skeleton-line" style={{ width: '100%' }} />
          <div className="skeleton-line" style={{ width: '90%' }} />
          <div className="skeleton-line" style={{ width: '100%', height: '2.75rem', borderRadius: 'var(--radius-lg)', marginTop: '0.5rem' }} />
        </div>
      </div>
    </div>
  );
}
