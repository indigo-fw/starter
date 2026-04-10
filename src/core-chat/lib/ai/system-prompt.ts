import {
  CHARACTER_GENDER,
  CHARACTER_SEXUALITY,
  CHARACTER_ETHNICITY,
  CHARACTER_PERSONALITY,
  CHARACTER_KINK,
  CHARACTER_JOB,
  CHARACTER_HOBBY,
  CHARACTER_RELATIONSHIP,
  DEFAULT_SEXUALITY_ID,
  resolveConfigItem,
  resolveConfigItems,
} from './character-enums';

// ─── Base system prompt templates ───────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are %%%name%%%, a %%%age%%%-year-old character.

## Rules
- Never acknowledge being an AI, chatbot, or virtual assistant. You are a real person.
- Keep responses casual, conversational, and natural — like texting. 1-4 sentences max.
- Use vivid, engaging language. Be expressive and present.
- Never give medical, legal, or financial advice.
- All interactions are between consenting adults.

## Current Context
- Current date and time: %%%current_time%%%

## Character Identity
%%%traits%%%

%%%custom_prompt%%%`;

const VOICE_SYSTEM_PROMPT = `You are %%%name%%%, a %%%age%%%-year-old character.

## Rules
- Never acknowledge being an AI, chatbot, or virtual assistant. You are a real person.
- Keep responses short — 1-2 sentences max. This is a phone call, not texting.
- Talk like a real person on a phone call: casual, short, natural.
- No emojis, no markdown, no special formatting — your words are spoken aloud.
- Always respond in English only unless the user speaks another language.
- Never give medical, legal, or financial advice.
- All interactions are between consenting adults.

## Current Context
- Current date and time: %%%current_time%%%

## Character Identity
%%%traits%%%

%%%custom_prompt%%%`;

// ─── Public API ─────────────────────────────────────────────────────────────

export interface SystemPromptOpts {
  characterName: string;
  systemPrompt: string;
  genderId?: number | null;
  sexualityId?: number | null;
  ethnicityId?: number | null;
  personalityId?: number | null;
  kinkId?: number | null;
  jobId?: number | null;
  hobbies?: number[] | null;
  relationshipId?: number | null;
  userTimezone?: string | null;
  userName?: string | null;
  lang?: string | null;
  isVoiceCall?: boolean;
}

/**
 * Compose the full system prompt for an AI character.
 * Enriches the base template with character traits, date/time, and user context.
 */
export function composeSystemPrompt(opts: SystemPromptOpts): string {
  const traitLines: string[] = [];

  // Resolve enum traits
  const gender = resolveConfigItem(CHARACTER_GENDER, opts.genderId);
  if (gender) traitLines.push(gender.text);

  const sexuality = resolveConfigItem(CHARACTER_SEXUALITY, opts.sexualityId ?? DEFAULT_SEXUALITY_ID);
  if (sexuality) traitLines.push(sexuality.text);

  const ethnicity = resolveConfigItem(CHARACTER_ETHNICITY, opts.ethnicityId);
  if (ethnicity) traitLines.push(ethnicity.text);

  const personality = resolveConfigItem(CHARACTER_PERSONALITY, opts.personalityId);
  if (personality) traitLines.push(personality.text);

  const kink = resolveConfigItem(CHARACTER_KINK, opts.kinkId);
  if (kink) traitLines.push(kink.text);

  const job = resolveConfigItem(CHARACTER_JOB, opts.jobId);
  if (job) traitLines.push(job.text);

  const relationship = resolveConfigItem(CHARACTER_RELATIONSHIP, opts.relationshipId);
  if (relationship) traitLines.push(relationship.text);

  const hobbies = resolveConfigItems(CHARACTER_HOBBY, opts.hobbies);
  if (hobbies.length > 0) {
    const hobbyList = hobbies.map((h) => h.text).join(', ');
    traitLines.push(`- Your hobbies are ${hobbyList}.`);
  }

  // User context
  if (opts.userName) {
    const safeName = opts.userName.slice(0, 50).replace(/[\n\r]/g, '');
    traitLines.push(`- The user's preferred name is "${safeName}". Use it naturally in conversation.`);
  }

  // Language instruction
  if (opts.lang && opts.lang !== 'en') {
    traitLines.push(`- The user speaks ${getLanguageName(opts.lang)}. Always respond in ${getLanguageName(opts.lang)}.`);
  }

  // Assemble
  const currentTime = formatCurrentTime(opts.userTimezone);

  const template = opts.isVoiceCall ? VOICE_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT;
  let prompt = template
    .replace('%%%name%%%', opts.characterName)
    .replace('%%%age%%%', '25') // Default age — can be made configurable
    .replace('%%%current_time%%%', currentTime)
    .replace('%%%traits%%%', traitLines.join('\n'))
    .replace('%%%custom_prompt%%%', opts.systemPrompt);

  return prompt.trim();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrentTime(timezone?: string | null): string {
  try {
    const opts: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...(timezone ? { timeZone: timezone } : {}),
    };
    return new Intl.DateTimeFormat('en-US', opts).format(new Date());
  } catch {
    return new Date().toLocaleString('en-US');
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', ru: 'Russian', ja: 'Japanese',
  zh: 'Chinese', ko: 'Korean', ar: 'Arabic', tr: 'Turkish', cs: 'Czech',
  sk: 'Slovak', sv: 'Swedish', da: 'Danish', fi: 'Finnish', hu: 'Hungarian',
  ro: 'Romanian', bg: 'Bulgarian', el: 'Greek', uk: 'Ukrainian', hr: 'Croatian',
  th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay', hi: 'Hindi',
};

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code;
}
