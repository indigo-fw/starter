import { cn } from '@/lib/utils';

const STYLES: Record<string, string> = {
  info: 'border-brand-300 bg-brand-50 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.10)] dark:border-[oklch(0.65_0.17_var(--brand-hue)_/_0.30)] text-brand-900 dark:text-brand-200',
  warning: 'border-yellow-300 bg-yellow-50 dark:bg-yellow-500/10 dark:border-yellow-500/30 text-yellow-900 dark:text-yellow-200',
  success: 'border-green-300 bg-green-50 dark:bg-green-500/10 dark:border-green-500/30 text-green-900 dark:text-green-200',
  error: 'border-red-300 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 text-red-900 dark:text-red-200',
};

interface Props {
  attrs: Record<string, string>;
  content?: string;
}

export function CalloutBlock({ attrs, content }: Props) {
  const type = attrs.type ?? 'info';
  const style = STYLES[type] ?? STYLES.info;

  return (
    <div className={cn('callout my-4 rounded-md border-l-4 p-4', style)}>
      {content && (
        <div dangerouslySetInnerHTML={{ __html: content }} />
      )}
    </div>
  );
}
