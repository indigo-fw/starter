'use client';

import { useEffect, useRef } from 'react';
import { ShoppingCart } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useRouter } from '@/i18n/navigation';
import { useBlankTranslations } from '@/lib/translations';
import './CartWidget.css';

function getSessionId(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )cart_session=([^;]*)/);
  if (match) return match[1]!;
  const id = crypto.randomUUID();
  document.cookie = `cart_session=${id};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  return id;
}

export function CartWidget() {
  const __ = useBlankTranslations();
  const router = useRouter();
  const sessionIdRef = useRef('');

  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  const { data } = trpc.storeCart.get.useQuery(
    { sessionId: sessionIdRef.current || undefined },
    { refetchOnWindowFocus: true, staleTime: 30_000 },
  );

  const itemCount = data?.itemCount ?? 0;

  return (
    <button
      type="button"
      className="icon-btn cart-widget"
      title={__('Cart')}
      onClick={() => router.push('/cart')}
    >
      <ShoppingCart className="h-4 w-4" />
      {itemCount > 0 && (
        <span className="cart-badge" aria-label={__('items in cart')}>
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </button>
  );
}
