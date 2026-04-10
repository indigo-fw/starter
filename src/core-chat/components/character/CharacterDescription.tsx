'use client';

import { useBlankTranslations } from '@/lib/translations';
import {
  CHARACTER_GENDER, CHARACTER_PERSONALITY, CHARACTER_KINK,
  CHARACTER_JOB, CHARACTER_HOBBY, CHARACTER_RELATIONSHIP,
  resolveConfigItem, resolveConfigItems,
} from '@/core-chat/lib/character/character-enums';

interface CharacterDescriptionProps {
  genderId?: number | null;
  personalityId?: number | null;
  kinkId?: number | null;
  jobId?: number | null;
  hobbies?: number[] | null;
  relationshipId?: number | null;
}

export function CharacterDescription(props: CharacterDescriptionProps) {
  const __ = useBlankTranslations();

  const gender = resolveConfigItem(CHARACTER_GENDER, props.genderId);
  const personality = resolveConfigItem(CHARACTER_PERSONALITY, props.personalityId);
  const kink = resolveConfigItem(CHARACTER_KINK, props.kinkId);
  const job = resolveConfigItem(CHARACTER_JOB, props.jobId);
  const hobbies = resolveConfigItems(CHARACTER_HOBBY, props.hobbies);
  const relationship = resolveConfigItem(CHARACTER_RELATIONSHIP, props.relationshipId);

  // Pronoun inference
  const pronoun = gender?.id === 1 ? __('She') : gender?.id === 2 ? __('He') : __('They');

  const lines: string[] = [];

  if (personality && job) {
    lines.push(`${pronoun} ${__('has a')} ${personality.title.toLowerCase()} ${__('personality and works as')} ${job.title.toLowerCase()}.`);
  } else if (personality) {
    lines.push(`${pronoun} ${__('has a')} ${personality.title.toLowerCase()} ${__('personality')}.`);
  } else if (job) {
    lines.push(`${pronoun} ${__('works as')} ${job.title.toLowerCase()}.`);
  }

  if (relationship) {
    lines.push(`${pronoun} ${__('is your')} ${relationship.title.toLowerCase()}.`);
  }

  if (kink) {
    lines.push(`${pronoun} ${__('is into')} ${kink.title.toLowerCase()}.`);
  }

  if (hobbies.length > 0) {
    const hobbyList = hobbies.map((h) => h.title.toLowerCase()).join(', ');
    lines.push(`${pronoun} ${__('enjoys')} ${hobbyList}.`);
  }

  if (lines.length === 0) return null;

  return (
    <div className="space-y-1">
      {lines.map((line, i) => (
        <p key={i} className="text-xs text-(--text-tertiary) leading-relaxed">{line}</p>
      ))}
    </div>
  );
}
