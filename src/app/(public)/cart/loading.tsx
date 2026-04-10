import '@/core-store/components/product/store-grid.css';
import '@/core-store/components/cart/store-cart.css';

export default function CartLoading() {
  return (
    <div className="app-container py-12">
      <div className="skeleton-line" style={{ width: '12rem', height: '2rem', marginBottom: '2rem' }} />
      <div className="cart-page">
        <div className="cart-items">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cart-item">
              <div className="cart-item-image skeleton-box" />
              <div className="cart-item-body">
                <div className="skeleton-line" style={{ width: '60%' }} />
                <div className="skeleton-line" style={{ width: '30%', marginTop: '0.375rem' }} />
                <div className="skeleton-line" style={{ width: '40%', marginTop: 'auto' }} />
              </div>
            </div>
          ))}
        </div>
        <div className="cart-summary">
          <div className="skeleton-line" style={{ width: '50%', height: '1.25rem' }} />
          <div className="skeleton-line" style={{ width: '100%', marginTop: '1rem' }} />
          <div className="skeleton-line" style={{ width: '100%' }} />
          <div className="skeleton-line" style={{ width: '100%', height: '3rem', marginTop: '0.5rem', borderRadius: 'var(--radius-lg)' }} />
        </div>
      </div>
    </div>
  );
}
