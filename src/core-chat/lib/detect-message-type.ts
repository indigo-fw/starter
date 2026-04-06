/**
 * Detect whether a user message is requesting text, image, or video.
 * Ported from sai_flirtcam's engine/types.ts.
 */

const VIDEO_PATTERN = /\bsend random video\b/i;
const TRIGGER_WORDS = /\b(?:send|show)\b/i;
const MEDIA_WORDS = /\b(?:images?|pictures?|pics?|photos?|nudes?|naked)\b/i;
const PICTURE_OF = /\ba picture of\b/i;

export type ResponseType = 'text' | 'image' | 'video';

export function detectMessageType(question: string): ResponseType {
  // Video: exact phrase "send random video"
  if (VIDEO_PATTERN.test(question)) return 'video';

  // Image: "send/show" + media word, OR "a picture of"
  if (TRIGGER_WORDS.test(question) && MEDIA_WORDS.test(question)) return 'image';
  if (PICTURE_OF.test(question)) return 'image';

  return 'text';
}
