import { describe, it, expect } from 'vitest';
import { detectMessageType } from '../lib/detect-message-type';
import { moderateByKeywords } from '../lib/moderation';
import { detectNsfw } from '../lib/image/nsfw-detector';
import { extractKeywords } from '../lib/image/normalizer';

/**
 * Integration test: exercises the full decision chain from user input
 * through moderation, message type detection, keyword extraction, and NSFW detection.
 * Does not require DB or network — tests pure logic only.
 */
describe('message pipeline integration', () => {
  describe('text message flow', () => {
    it('normal text passes moderation and routes to text', () => {
      const content = 'Hello, how are you doing today?';
      const modResult = moderateByKeywords(content, ['badword'], 'block');
      expect(modResult.passed).toBe(true);

      const type = detectMessageType(content);
      expect(type).toBe('text');
    });

    it('blocked content stops at moderation', () => {
      const content = 'I want to kill someone';
      const modResult = moderateByKeywords(content, ['kill'], 'block');
      expect(modResult.passed).toBe(false);
      expect(modResult.action).toBe('block');
      // Pipeline stops here — no type detection or AI dispatch
    });
  });

  describe('image message flow', () => {
    it('image request routes to image generation', () => {
      const content = 'Send me a photo in a red bikini on the beach';
      const modResult = moderateByKeywords(content, ['kill'], 'block');
      expect(modResult.passed).toBe(true);

      const type = detectMessageType(content);
      expect(type).toBe('image');

      // Keyword extraction for image pipeline
      const keywords = extractKeywords(content);
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain('bikini');
      expect(keywords).toContain('beach');
    });

    it('NSFW detection works on extracted keywords', () => {
      const keywords = extractKeywords('show me nude photo');
      const isNsfw = detectNsfw(keywords);
      expect(isNsfw).toBe(true);
    });

    it('SFW content is not flagged as NSFW', () => {
      const keywords = extractKeywords('show me a photo in a dress');
      const isNsfw = detectNsfw(keywords);
      expect(isNsfw).toBe(false);
    });
  });

  describe('video message flow', () => {
    it('video request routes to video generation', () => {
      const content = 'send random video';
      const type = detectMessageType(content);
      expect(type).toBe('video');
    });
  });

  describe('keyword extraction quality', () => {
    it('extracts meaningful keywords from complex prompts', () => {
      const keywords = extractKeywords('Can you send me a sexy picture of you wearing a black dress in a bedroom?');
      // Should have: sexy, dress, bedroom (meaningful terms)
      // Should NOT have: can, you, me, a, of, wearing, in (stop words)
      expect(keywords).not.toContain('can');
      expect(keywords).not.toContain('you');
      expect(keywords).not.toContain('wearing');
    });

    it('handles NSFW keyword extraction', () => {
      const keywords = extractKeywords('nude naked topless');
      // "naked" is synonymized to "nude", deduped — so only "nude" and "topless" remain
      expect(keywords).toContain('nude');
      expect(keywords).toContain('topless');

      const isNsfw = detectNsfw(keywords);
      expect(isNsfw).toBe(true);
    });
  });
});
