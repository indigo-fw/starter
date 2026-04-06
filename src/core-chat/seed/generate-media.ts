/**
 * Generate placeholder media for seeded characters.
 * Creates SVG silhouettes → PNG via sharp → video via ffmpeg.
 */
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── SVG Generation ─────────────────────────────────────────────────────────

const HUES = [0, 30, 60, 120, 180, 210, 240, 270, 300, 330];

/**
 * Generate an SVG silhouette placeholder for a character.
 */
export function generateSilhouetteSvg(name: string, index: number): string {
  const hue = HUES[index % HUES.length]!;
  const bgStart = `hsl(${hue}, 60%, 25%)`;
  const bgEnd = `hsl(${(hue + 40) % 360}, 50%, 15%)`;
  const silhouetteColor = `hsl(${hue}, 40%, 12%)`;
  const textColor = `hsl(${hue}, 70%, 80%)`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="0 0 512 768">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgStart}"/>
      <stop offset="100%" stop-color="${bgEnd}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="768" fill="url(#bg)"/>
  <!-- Head -->
  <circle cx="256" cy="280" r="85" fill="${silhouetteColor}"/>
  <!-- Shoulders/Body -->
  <ellipse cx="256" cy="520" rx="160" ry="200" fill="${silhouetteColor}"/>
  <!-- Neck -->
  <rect x="226" y="350" width="60" height="50" fill="${silhouetteColor}" rx="10"/>
  <!-- Name text -->
  <text x="256" y="720" text-anchor="middle" fill="${textColor}" font-family="Arial, sans-serif" font-size="32" font-weight="bold">${escapeXml(name)}</text>
</svg>`;
}

/**
 * Convert SVG string to PNG buffer via sharp.
 */
export async function svgToPng(svg: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(Buffer.from(svg)).resize(512, 768).png().toBuffer();
}

/**
 * Generate a 5s video from a PNG image via ffmpeg (slow zoom effect).
 * Returns video buffer, or null if ffmpeg is not available.
 */
export function pngToVideo(pngBuffer: Buffer): Buffer | null {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
  } catch {
    return null; // ffmpeg not available
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'chat-seed-'));
  const inputPath = join(tmpDir, 'input.png');
  const outputPath = join(tmpDir, 'output.mp4');

  try {
    writeFileSync(inputPath, pngBuffer);

    execSync(
      `ffmpeg -loop 1 -i "${inputPath}" -filter_complex "zoompan=z='min(zoom+0.0015,1.3)':d=150:s=512x768:fps=30" -t 5 -c:v libx264 -pix_fmt yuv420p -y "${outputPath}"`,
      { stdio: 'ignore', timeout: 30_000 },
    );

    if (!existsSync(outputPath)) return null;
    return readFileSync(outputPath);
  } catch {
    return null;
  } finally {
    try { unlinkSync(inputPath); } catch { /* */ }
    try { unlinkSync(outputPath); } catch { /* */ }
    try { rmSync(tmpDir, { recursive: true }); } catch { /* */ }
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
