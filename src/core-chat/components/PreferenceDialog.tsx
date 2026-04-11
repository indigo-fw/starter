'use client';

import { useState } from 'react';
import { useBlankTranslations } from '@/lib/translations';
import { CHARACTER_GENDER } from '@/core-chat/lib/character/character-enums';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PreferenceDialogProps {
  onSubmit: (prefs: { name: string; genderId?: number }) => void;
  onSkip: () => void;
}

const STORAGE_KEY = 'chat-preferences-set';

/**
 * First-visit preference dialog.
 * Asks for name and preferred gender. Saves to localStorage.
 */
export function PreferenceDialog({ onSubmit, onSkip }: PreferenceDialogProps) {
  const __ = useBlankTranslations();
  const [name, setName] = useState('');
  const [genderId, setGenderId] = useState<number | undefined>();

  function handleSubmit() {
    localStorage.setItem(STORAGE_KEY, 'true');
    onSubmit({ name: name.trim(), genderId });
  }

  function handleSkip() {
    localStorage.setItem(STORAGE_KEY, 'true');
    onSkip();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={__('Set preferences')}>
      <div className="absolute inset-0 bg-black/50" onClick={handleSkip} />
      <div className="relative w-full max-w-md bg-(--surface-primary) rounded-2xl shadow-xl border border-(--border-primary) overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--border-primary)">
          <h2 className="text-base font-semibold text-(--text-primary)">{__('Welcome!')}</h2>
          <button onClick={handleSkip} className="p-1 text-(--text-tertiary) hover:text-(--text-primary)"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-sm font-medium text-(--text-secondary) mb-2 block">{__("What's your name?")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 50))}
              placeholder={__('Enter your name')}
              className="input w-full"
              autoFocus
            />
          </div>

          {/* Gender preference */}
          <div>
            <label className="text-sm font-medium text-(--text-secondary) mb-2 block">{__('Who are you looking for?')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setGenderId(undefined)}
                className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors',
                  genderId === undefined ? 'bg-brand-500/10 text-brand-500 border-brand-500/30' : 'bg-(--surface-secondary) text-(--text-tertiary) border-transparent'
                )}
              >
                {__('Everyone')}
              </button>
              {[...CHARACTER_GENDER.values()].map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGenderId(g.id)}
                  className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors',
                    genderId === g.id ? 'bg-brand-500/10 text-brand-500 border-brand-500/30' : 'bg-(--surface-secondary) text-(--text-tertiary) border-transparent'
                  )}
                >
                  {g.icon} {g.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-(--border-primary) flex justify-between">
          <button onClick={handleSkip} className="text-sm text-(--text-tertiary) hover:text-(--text-primary)">
            {__('Skip')}
          </button>
          <button
            onClick={handleSubmit}
            className="btn btn-primary text-sm"
          >
            {__("Let's go!")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Check if preferences have been set (localStorage) */
export function hasSetPreferences(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}
