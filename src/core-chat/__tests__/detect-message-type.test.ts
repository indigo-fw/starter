import { describe, it, expect } from 'vitest';
import { detectMessageType } from '../lib/detect-message-type';

describe('detectMessageType', () => {
  it('returns text for regular messages', () => {
    expect(detectMessageType('Hello, how are you?')).toBe('text');
    expect(detectMessageType('Tell me about yourself')).toBe('text');
    expect(detectMessageType('What do you think about that?')).toBe('text');
  });

  it('detects image requests with send + media word', () => {
    expect(detectMessageType('Send me a photo')).toBe('image');
    expect(detectMessageType('show me a picture')).toBe('image');
    expect(detectMessageType('Send me some nudes')).toBe('image');
    expect(detectMessageType('Show me an image of you')).toBe('image');
    expect(detectMessageType('send pics')).toBe('image');
  });

  it('detects image requests with "a picture of"', () => {
    expect(detectMessageType('I want a picture of you in a dress')).toBe('image');
    expect(detectMessageType('Can you make a picture of a sunset?')).toBe('image');
  });

  it('detects video requests', () => {
    expect(detectMessageType('send random video')).toBe('video');
    expect(detectMessageType('Send random video please')).toBe('video');
  });

  it('does not false-positive on similar words', () => {
    expect(detectMessageType('I took a photo today')).toBe('text');
    expect(detectMessageType('The picture was beautiful')).toBe('text');
    expect(detectMessageType('I love sending messages')).toBe('text');
  });
});
