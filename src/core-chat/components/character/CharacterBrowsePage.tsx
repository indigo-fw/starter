'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { CharacterGridCard } from './CharacterGridCard';
import { CharacterFilterBar } from './CharacterFilterBar';
import { PreferenceDialog, hasSetPreferences } from '../PreferenceDialog';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Filters {
  genderId?: number;
  ethnicityId?: number;
  personalityId?: number;
}

export function CharacterBrowsePage() {
  const __ = useBlankTranslations();
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [showPrefs, setShowPrefs] = useState(false);

  // Show preference dialog on first visit (after short delay)
  useEffect(() => {
    if (!hasSetPreferences()) {
      const timer = setTimeout(() => setShowPrefs(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Fetch characters
  const { data, isLoading } = trpc.chatPublic.characters.useQuery({
    ...filters,
    page,
    pageSize: 12,
  });

  // Fetch filter counts
  const { data: filterCounts } = trpc.chatPublic.characterFilters.useQuery();

  // Create conversation mutation
  const createConv = trpc.conversations.create.useMutation();
  const utils = trpc.useUtils();

  const handleCharacterClick = useCallback((characterId: string) => {
    createConv.mutate({ characterId }, {
      onSuccess: (result) => {
        utils.conversations.list.invalidate();
        router.push(`/chat/${result.id}`);
      },
      onError: (err) => {
        // If unauthorized, redirect to login with callback
        if (err.data?.code === 'UNAUTHORIZED') {
          router.push(`/dashboard/login?callbackUrl=/characters`);
        }
      },
    });
  }, [createConv, router, utils]);

  const updatePrefsMutation = trpc.conversations.updatePreferences.useMutation();

  const handlePreferenceSubmit = useCallback((prefs: { name: string; genderId?: number }) => {
    setShowPrefs(false);
    if (prefs.genderId) setFilters({ genderId: prefs.genderId });
    if (prefs.name) localStorage.setItem('chat-preferred-name', prefs.name);
    // Save to DB if authenticated (fire-and-forget, mutation fails silently for guests)
    updatePrefsMutation.mutate({
      preferredName: prefs.name || null,
      preferredGender: prefs.genderId ?? null,
    });
  }, [updatePrefsMutation]);

  return (
    <div className="min-h-screen bg-(--surface-primary)">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-(--text-primary)">{__('AI Characters')}</h1>
        <p className="text-sm text-(--text-secondary) mt-1">
          {__('Find your perfect companion and start chatting')}
        </p>
      </div>

      {/* Filter bar */}
      <div className="max-w-7xl mx-auto px-4 pb-6">
        <CharacterFilterBar
          filters={filters}
          onFilterChange={(f) => { setFilters(f); setPage(1); }}
          counts={filterCounts}
        />
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-4 pb-12">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-(--text-tertiary)" size={32} />
          </div>
        ) : !data?.results.length ? (
          <div className="text-center py-20 text-sm text-(--text-tertiary)">
            {__('No characters found. Try adjusting your filters.')}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {data.results.map((char) => (
                <CharacterGridCard
                  key={char.id}
                  name={char.name}
                  tagline={char.tagline}
                  featuredImageUrl={char.featuredImageUrl}
                  featuredVideoUrl={char.featuredVideoUrl}
                  avatarUrl={char.avatarUrl}
                  onClick={() => handleCharacterClick(char.id)}
                />
              ))}
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-(--text-secondary) hover:bg-(--surface-secondary) disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={16} />
                  {__('Previous')}
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                        p === page
                          ? 'bg-brand-500 text-white'
                          : 'text-(--text-secondary) hover:bg-(--surface-secondary)',
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page >= data.totalPages}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-(--text-secondary) hover:bg-(--surface-secondary) disabled:opacity-30 transition-colors"
                >
                  {__('Next')}
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* Total count */}
            <p className="text-center text-xs text-(--text-tertiary) mt-4">
              {data.total} {__('characters')}
            </p>
          </>
        )}
      </div>

      {/* Preference dialog */}
      {showPrefs && (
        <PreferenceDialog
          onSubmit={handlePreferenceSubmit}
          onSkip={() => setShowPrefs(false)}
        />
      )}
    </div>
  );
}
