import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ─── Mocks (before component imports) ─────────────────────────────────────

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string | Record<string, unknown>; children: React.ReactNode; [k: string]: unknown }) => {
    const resolvedHref = typeof href === 'object' && href !== null
      ? `/store/${(href as Record<string, Record<string, string>>).params?.slug ?? ''}`
      : String(href);
    return <a href={resolvedHref} {...props}>{children}</a>;
  },
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/components/Link', () => ({
  Link: ({ href, children, ...props }: { href: string | Record<string, unknown>; children: React.ReactNode; [k: string]: unknown }) => {
    const resolvedHref = typeof href === 'object' && href !== null
      ? `/store/${(href as Record<string, Record<string, string>>).params?.slug ?? ''}`
      : String(href);
    return <a href={resolvedHref} {...props}>{children}</a>;
  },
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src as string}
      alt={props.alt as string}
      width={props.width as number}
      height={props.height as number}
    />
  ),
}));

vi.mock('@/lib/translations', () => ({
  useBlankTranslations: () => (key: string) => key,
}));

vi.mock('lucide-react', () => ({
  Search: ({ className }: { className?: string }) => <span data-testid="icon-search" className={className} />,
  Download: ({ className }: { className?: string }) => <span data-testid="icon-download" className={className} />,
  Package: ({ className }: { className?: string }) => <span data-testid="icon-package" className={className} />,
}));

import { VariantSelector } from '@/core-store/components/product/VariantSelector';
import { ProductCard } from '@/app/(public)/store/ProductCard';
import { StoreToolbar } from '@/app/(public)/store/StoreToolbar';

afterEach(() => {
  cleanup();
});

// ─── VariantSelector ──────────────────────────────────────────────────────

describe('VariantSelector', () => {
  const optionGroups = [
    { name: 'Size', values: ['S', 'M', 'L'] },
    { name: 'Color', values: ['Red', 'Blue'] },
  ];

  it('renders all option groups and values', () => {
    render(
      <VariantSelector
        optionGroups={optionGroups}
        selections={{ Size: 'M', Color: 'Red' }}
        onSelect={vi.fn()}
      />,
    );

    // Group labels
    expect(screen.getByText('Size:')).toBeInTheDocument();
    expect(screen.getByText('Color:')).toBeInTheDocument();

    // All values rendered as buttons
    for (const val of ['S', 'M', 'L', 'Red', 'Blue']) {
      expect(screen.getByRole('button', { name: val })).toBeInTheDocument();
    }
  });

  it('calls onSelect with correct args when clicking an option', () => {
    const onSelect = vi.fn();
    render(
      <VariantSelector
        optionGroups={optionGroups}
        selections={{ Size: 'M', Color: 'Red' }}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'L' }));
    expect(onSelect).toHaveBeenCalledWith('Size', 'L');

    fireEvent.click(screen.getByRole('button', { name: 'Blue' }));
    expect(onSelect).toHaveBeenCalledWith('Color', 'Blue');
  });

  it('shows data-selected on the active option', () => {
    render(
      <VariantSelector
        optionGroups={optionGroups}
        selections={{ Size: 'M', Color: 'Red' }}
        onSelect={vi.fn()}
      />,
    );

    const mButton = screen.getByRole('button', { name: 'M' });
    expect(mButton).toHaveAttribute('data-selected', 'true');

    const sButton = screen.getByRole('button', { name: 'S' });
    expect(sButton).not.toHaveAttribute('data-selected');

    const redButton = screen.getByRole('button', { name: 'Red' });
    expect(redButton).toHaveAttribute('data-selected', 'true');
  });
});

// ─── ProductCard ──────────────────────────────────────────────────────────

describe('ProductCard', () => {
  const baseProduct = {
    id: 'prod-1',
    name: 'Test Widget',
    slug: 'test-widget',
    type: 'simple' as const,
    priceCents: 1999,
    comparePriceCents: null,
    currency: 'EUR',
    featuredImage: null,
    shortDescription: 'A fine widget',
  };

  const translations = {
    sale: 'Sale',
    digital: 'Digital',
    fromVariants: 'From variants',
  };

  it('renders product name and price', () => {
    render(<ProductCard product={baseProduct} translations={translations} />);

    expect(screen.getByText('Test Widget')).toBeInTheDocument();
    // EUR 19.99
    expect(screen.getByText(/19\.99/)).toBeInTheDocument();
  });

  it('shows sale badge when comparePriceCents > priceCents', () => {
    const product = {
      ...baseProduct,
      priceCents: 1500,
      comparePriceCents: 2500,
    };
    render(<ProductCard product={product} translations={translations} />);

    expect(screen.getByText('Sale')).toBeInTheDocument();
    // Compare price also rendered
    expect(screen.getByText(/25\.00/)).toBeInTheDocument();
  });

  it('does not show sale badge when no discount', () => {
    render(<ProductCard product={baseProduct} translations={translations} />);

    expect(screen.queryByText('Sale')).not.toBeInTheDocument();
  });

  it('shows digital badge for type="digital"', () => {
    const product = { ...baseProduct, type: 'digital' as const };
    render(<ProductCard product={product} translations={translations} />);

    expect(screen.getByText('Digital')).toBeInTheDocument();
  });

  it('links to correct product URL', () => {
    render(<ProductCard product={baseProduct} translations={translations} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/store/test-widget');
  });
});

// ─── StoreToolbar ─────────────────────────────────────────────────────────

describe('StoreToolbar', () => {
  it('renders search input with current search value', () => {
    render(<StoreToolbar currentSort="newest" currentSearch="shoes" />);

    const input = screen.getByRole('searchbox');
    expect(input).toHaveValue('shoes');
  });

  it('renders sort select with current value', () => {
    render(<StoreToolbar currentSort="price_asc" currentSearch="" />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('price_asc');
  });

  it('renders all sort options', () => {
    render(<StoreToolbar currentSort="newest" currentSearch="" />);

    expect(screen.getByRole('option', { name: 'Newest' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Price: Low to High' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Price: High to Low' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Name' })).toBeInTheDocument();
  });
});
