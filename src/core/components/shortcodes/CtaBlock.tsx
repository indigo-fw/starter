import { cn } from '@/lib/utils';

const BUTTON_STYLES: Record<string, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'bg-(--surface-secondary) text-(--text-primary) hover:bg-(--surface-secondary)/80',
  outline: 'border-2 border-brand-600 text-brand-600 hover:bg-brand-50 dark:hover:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.10)]',
};

interface Props {
  attrs: Record<string, string>;
}

function isSafeUrl(url: string): boolean {
  if (url === '#' || url.startsWith('/') || url.startsWith('https://') || url.startsWith('http://')) return true;
  return false;
}

export function CtaBlock({ attrs }: Props) {
  const text = attrs.text ?? 'Click here';
  const rawUrl = attrs.url ?? '#';
  const url = isSafeUrl(rawUrl) ? rawUrl : '#';
  const style = BUTTON_STYLES[attrs.style ?? 'primary'] ?? BUTTON_STYLES.primary;

  return (
    <div className="cta my-6 text-center">
      <a
        href={url}
        className={cn('inline-block rounded-md px-6 py-3 font-medium transition-colors', style)}
        target={url.startsWith('http') ? '_blank' : undefined}
        rel={url.startsWith('http') ? 'noopener noreferrer' : undefined}
      >
        {text}
      </a>
    </div>
  );
}
