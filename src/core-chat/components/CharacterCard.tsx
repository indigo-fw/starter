'use client';

import { MessageSquare, Sparkles, Clock } from 'lucide-react';

interface CharacterCardProps {
  character: {
    name: string;
    avatarUrl?: string | null;
    tagline?: string | null;
    personality?: string | null;
  };
  stats?: {
    messageCount: number;
    totalTokensUsed: number;
    createdAt: Date | string;
  };
}

export function CharacterCard({ character, stats }: CharacterCardProps) {
  return (
    <div className="flex flex-col h-full border-l border-(--border-primary) bg-(--surface-primary) p-4">
      {/* Avatar */}
      <div className="flex flex-col items-center text-center mb-4">
        <div className="w-20 h-20 rounded-full bg-(--surface-secondary) mb-3 flex items-center justify-center overflow-hidden">
          {character.avatarUrl ? (
            <img src={character.avatarUrl} alt={character.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-(--text-secondary)">
              {character.name[0]?.toUpperCase()}
            </span>
          )}
        </div>
        <h3 className="text-base font-semibold text-(--text-primary)">{character.name}</h3>
        {character.tagline && (
          <p className="text-xs text-(--text-secondary) mt-0.5">{character.tagline}</p>
        )}
      </div>

      {/* Personality */}
      {character.personality && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={12} className="text-brand-500" />
            <span className="text-xs font-medium text-(--text-secondary)">Personality</span>
          </div>
          <p className="text-xs text-(--text-tertiary) leading-relaxed">
            {character.personality}
          </p>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="mt-auto pt-4 border-t border-(--border-primary) space-y-2">
          <div className="flex items-center gap-2 text-xs text-(--text-tertiary)">
            <MessageSquare size={12} />
            <span>{stats.messageCount} messages</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-(--text-tertiary)">
            <Clock size={12} />
            <span>Started {formatDate(stats.createdAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
