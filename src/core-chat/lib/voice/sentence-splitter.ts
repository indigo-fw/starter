/**
 * Split text into sentences for TTS streaming.
 */

const SENTENCE_END_SPLIT = /(?<=[.!?])\s+/;
const ENDS_WITH_PUNCTUATION = /[.!?]$/;
const MIN_SENTENCE_LENGTH = 10;

/**
 * Split text into speakable sentences.
 * Returns array of complete sentences + remainder (incomplete tail).
 */
export function splitSentences(text: string): { sentences: string[]; remainder: string } {
  const trimmed = text.trim();
  if (!trimmed) return { sentences: [], remainder: '' };

  const parts = trimmed.split(SENTENCE_END_SPLIT);
  const sentences: string[] = [];
  let remainder = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!.trim();
    if (!part) continue;

    const isLast = i === parts.length - 1;
    const endsWithPunctuation = ENDS_WITH_PUNCTUATION.test(part);

    if (isLast && !endsWithPunctuation) {
      // Last part without sentence-ending punctuation — it's a remainder
      remainder = part;
    } else if (part.length >= MIN_SENTENCE_LENGTH) {
      sentences.push(part);
    } else if (sentences.length > 0) {
      // Short fragment — append to previous
      sentences[sentences.length - 1] += ' ' + part;
    } else if (endsWithPunctuation) {
      // Short but complete sentence
      sentences.push(part);
    } else {
      remainder = part;
    }
  }

  return { sentences, remainder };
}
