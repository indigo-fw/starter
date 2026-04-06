import { readFileSync, writeFileSync } from 'fs';

for (const file of process.argv.slice(2)) {
  const original = readFileSync(file, 'utf8');
  // bg-(--color-brand-500) → bg-brand-500
  // text-(--color-accent-300) → text-accent-300
  // border-(--color-gray-200) → border-gray-200
  const fixed = original.replace(/(\w+)-\(--color-([^)]+)\)/g, '$1-$2');
  if (fixed !== original) {
    writeFileSync(file, fixed);
  }
}
