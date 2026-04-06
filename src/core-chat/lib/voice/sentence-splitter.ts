/**
 * Split text into sentences for TTS streaming.
 * Yields complete sentences as they're extracted from accumulating text.
 */

const SENTENCE_END = /(?<=[.!?])\s+/;
const MIN_SENTENCE_LENGTH = 10;

/**
 * Split text into speakable sentences.
 * Returns array of sentences, with partial remainder if text doesn't end cleanly.
 */
export function splitSentences(text: string): { sentences: string[]; remainder: string } {
  const parts = text.split(SENTENCE_END);
  const sentences: string[] = [];
  let remainder = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!.trim();
    if (!part) continue;

    if (i === parts.length - 1 && !SENTENCE_END.test(text.slice(text.lastIndexOf(part)))) {
      // Last part doesn't end with sentence boundary — it's a remainder
      remainder = part;
    } else if (part.length >= MIN_SENTENCE_LENGTH) {
      sentences.push(part);
    } else if (sentences.length > 0) {
      // Short fragment — append to previous sentence
      sentences[sentences.length - 1] += ' ' + part;
    } else {
      remainder = part;
    }
  }

  return { sentences, remainder };
}
