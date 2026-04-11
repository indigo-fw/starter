import type { ImageAdapter, ImageRequest, ImageResponse, AdapterResponse } from '../types';

// Minimal valid 1x1 red PNG (68 bytes)
const _MOCK_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

// Placeholder SVG image with text (more useful for dev than a 1x1 pixel)
function createPlaceholderSvg(width: number, height: number, prompt: string): string {
  const text = prompt.slice(0, 40) || 'Mock Image';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#1a1a2e"/>
    <rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="#e94560" stroke-width="2" rx="8"/>
    <text x="50%" y="45%" text-anchor="middle" fill="#e94560" font-family="monospace" font-size="14">🖼️ Mock Image</text>
    <text x="50%" y="58%" text-anchor="middle" fill="#888" font-family="monospace" font-size="11">${escapeXml(text)}</text>
    <text x="50%" y="70%" text-anchor="middle" fill="#555" font-family="monospace" font-size="10">${width}×${height}</text>
  </svg>`;
}

/**
 * Mock image adapter for local development.
 * Returns a placeholder SVG as a data URL after a realistic delay.
 */
export class MockImageAdapter implements ImageAdapter {
  async generate(request: ImageRequest): Promise<AdapterResponse<ImageResponse>> {
    const width = request.width ?? 1024;
    const height = request.height ?? 1024;

    await delay(1000 + Math.random() * 2000);

    const svg = createPlaceholderSvg(width, height, request.prompt);
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

    return {
      result: {
        url: dataUrl,
        width,
        height,
        seed: Math.floor(Math.random() * 999999),
      },
      metadata: { model: 'mock-image', prompt: request.prompt.slice(0, 100) },
    };
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
