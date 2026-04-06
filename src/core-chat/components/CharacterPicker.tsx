'use client';

import { trpc } from '@/lib/trpc/client';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CharacterPickerProps {
  onSelect: (characterId: string) => void;
  onClose: () => void;
  isCreating: boolean;
}

export function CharacterPicker({ onSelect, onClose, isCreating }: CharacterPickerProps) {
  const { data: characters, isLoading } = trpc.chatPublic.characters.useQuery({ limit: 20 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-(--surface-primary) rounded-2xl shadow-xl border border-(--border-primary) overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--border-primary)">
          <h2 className="text-base font-semibold text-(--text-primary)">Choose a character</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-secondary) transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Character grid */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-(--text-tertiary)" size={24} />
            </div>
          ) : !characters?.length ? (
            <p className="text-center text-sm text-(--text-tertiary) py-8">
              No characters available yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {characters.map((char) => (
                <button
                  key={char.id}
                  onClick={() => onSelect(char.id)}
                  disabled={isCreating}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-xl border border-(--border-primary)',
                    'text-left transition-all hover:border-brand-500/50 hover:bg-brand-500/5',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <div className="w-12 h-12 rounded-full bg-(--surface-secondary) shrink-0 flex items-center justify-center overflow-hidden">
                    {char.avatarUrl ? (
                      <img src={char.avatarUrl} alt={char.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-(--text-secondary)">
                        {char.name[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-(--text-primary)">{char.name}</div>
                    {char.tagline && (
                      <p className="text-xs text-(--text-tertiary) mt-0.5 line-clamp-2">
                        {char.tagline}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
