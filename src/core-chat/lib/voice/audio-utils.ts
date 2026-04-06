/**
 * Audio utilities for voice calls.
 * WAV encoding, binary protocol, base64 helpers.
 */

/**
 * Create a WAV buffer from Int16LE PCM data.
 */
export function createWavBuffer(pcmData: Int16Array, sampleRate: number = 16000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length * 2;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // PCM data
  const pcmBuffer = Buffer.from(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
  pcmBuffer.copy(buffer, 44);

  return buffer;
}

/**
 * Binary protocol for voice audio frames over WebSocket.
 *
 * Frame layout (5-byte header + audio):
 * [0-3] conversationId hash (uint32 LE) — for routing
 * [4]   flags (uint8: bit 0 = is_final)
 * [5..] PCM Int16LE audio samples
 */
export function encodeVoiceFrame(
  conversationIdHash: number,
  audio: Int16Array,
  isFinal: boolean,
): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt32LE(conversationIdHash, 0);
  header.writeUInt8(isFinal ? 1 : 0, 4);

  const audioBuffer = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
  return Buffer.concat([header, audioBuffer]);
}

export function decodeVoiceFrame(data: Buffer): {
  conversationIdHash: number;
  isFinal: boolean;
  audio: Int16Array;
} {
  const conversationIdHash = data.readUInt32LE(0);
  const isFinal = (data.readUInt8(4) & 1) === 1;
  const audioData = data.subarray(5);
  const audio = new Int16Array(audioData.buffer, audioData.byteOffset, audioData.byteLength / 2);

  return { conversationIdHash, isFinal, audio };
}

/**
 * Simple hash for conversation ID → uint32 (for binary protocol header).
 */
export function hashConversationId(conversationId: string): number {
  let hash = 0;
  for (let i = 0; i < conversationId.length; i++) {
    const char = conversationId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash >>> 0;
}
