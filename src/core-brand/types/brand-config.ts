/**
 * BrandConfig — the single source of truth for project branding.
 *
 * A discriminated union over three modes. The chosen `mode` determines which
 * other fields are required; the TypeScript compiler enforces this so that
 * the user gets a red squiggle when their config is missing required assets
 * for the mode they declared.
 *
 * Runtime validation (`validateBrandConfig`) double-checks file existence and
 * any rules the type system can't express (e.g. "favicon source must be square").
 */

// ─── Shared sub-types ────────────────────────────────────────────────────────

export type BrandMode = 'icon+text' | 'text-only' | 'lockup';

export interface WordmarkConfig {
  /** Text to display. Defaults to BrandConfig.name. */
  text?: string;
  /** CSS font-family stack. */
  font: string;
  /** CSS font-weight (100–900). */
  weight: number;
  /** CSS letter-spacing in em units (e.g. -0.02). */
  tracking?: number;
}

export interface FaviconGlyph {
  /** Single character rendered as the favicon (e.g. 'I' for Indigo). */
  text: string;
  /** CSS font-family stack. */
  font: string;
  /** CSS font-weight. */
  weight: number;
  /** Background fill for the favicon square. */
  bg: string;
  /** Glyph color. */
  fg: string;
}

export interface BrandColors {
  /** Primary brand color (OKLCH or hex). */
  brand: string;
  /** Light-mode page background. Used for OG image light variant. */
  bgLight: string;
  /** Dark-mode page background. Used for OG image dark variant. */
  bgDark: string;
}

export interface OgImageConfig {
  /** Template used to compose the OG image. */
  template: 'gradient-mark' | 'centered-lockup' | 'custom-svg';
  /** Optional tagline rendered under the brand. */
  tagline?: string;
  /** Path to a custom SVG (only when template === 'custom-svg'). */
  customSvg?: string;
}

export interface PressConfig {
  /** Whether to scaffold the /brand page. */
  enabled?: boolean;
  /** Route slug. Defaults to '/brand'. /press always redirects here. */
  slug?: string;
  /** Contact email displayed on the brand page. */
  contactEmail?: string;
}

// ─── Mode-specific configs ───────────────────────────────────────────────────

interface BrandConfigBase {
  /** Brand wordmark text used in page titles, email signatures, etc. */
  name: string;
  /** Common color palette across all modes. */
  colors: BrandColors;
  /** OG / social image composition. */
  ogImage?: OgImageConfig;
  /** Brand page configuration. */
  press?: PressConfig;
}

/**
 * Mode 1: user has a square SVG icon AND wants the wordmark rendered as live
 * text in a chosen font. The most common case.
 */
export interface BrandConfigIconText extends BrandConfigBase {
  mode: 'icon+text';
  /** Path to a square (1:1) SVG file under the project root. */
  icon: string;
  /** Live-text wordmark rendered alongside the icon. */
  wordmark: WordmarkConfig;
  /**
   * Optional: separate favicon glyph. Defaults to using `icon`. Only specify
   * if the icon is too detailed for favicon rendering and a simpler glyph reads
   * better at 16px (e.g. the first letter of `name`).
   */
  faviconGlyph?: FaviconGlyph;
}

/**
 * Mode 2: user has no icon — just text. Forces a `faviconGlyph` because there
 * is no automated way to produce a recognizable square favicon from text alone.
 */
export interface BrandConfigTextOnly extends BrandConfigBase {
  mode: 'text-only';
  /** Live-text wordmark. */
  wordmark: WordmarkConfig;
  /** REQUIRED — used to generate the favicon square. */
  faviconGlyph: FaviconGlyph;
}

/**
 * Mode 3: user has one horizontal SVG that already includes icon + text composed.
 * Used as-is for OG / nav lockups; favicon generation still requires EITHER a
 * separate square `icon` OR a `faviconGlyph` — auto-cropping a lockup produces
 * poor results and is not supported.
 */
export interface BrandConfigLockup extends BrandConfigBase {
  mode: 'lockup';
  /** Path to the horizontal lockup SVG. */
  lockup: string;
  /** Square icon SVG for favicons (optional if `faviconGlyph` is provided). */
  icon?: string;
  /** Generated favicon glyph (optional if `icon` is provided). */
  faviconGlyph?: FaviconGlyph;
}

export type BrandConfig = BrandConfigIconText | BrandConfigTextOnly | BrandConfigLockup;
