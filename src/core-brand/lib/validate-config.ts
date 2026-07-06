/**
 * Runtime validation of BrandConfig — checks file existence and rules the
 * TS type system can't express (favicon source must be square SVG, etc.).
 *
 * Called by `getBrandConfig()` on load and by the CLI before generation.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrandConfig } from '../types/brand-config';

export interface ValidationError {
  /** Top-level config field that failed (e.g. 'icon', 'lockup'). */
  field: string;
  /** Human-readable problem description. */
  message: string;
  /** Optional suggestion to fix it. */
  hint?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

const PROJECT_ROOT = process.cwd();

function fileExists(relativePath: string): boolean {
  // Tolerate either leading-slash absolute-ish paths or plain relative paths.
  const cleaned = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return existsSync(resolve(PROJECT_ROOT, cleaned));
}

function readSvg(relativePath: string): string | null {
  try {
    const cleaned = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    return readFileSync(resolve(PROJECT_ROOT, cleaned), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Rough heuristic for "is this SVG square?": pulls viewBox or width/height from
 * the root svg element. Returns true if dimensions are within 10% of each other,
 * or true if we can't determine (to avoid false negatives on edge SVGs).
 */
function isSvgRoughlySquare(svg: string): boolean {
  const viewBoxMatch = svg.match(/viewBox\s*=\s*["']([^"']+)["']/);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [, , w, h] = parts;
      if (w > 0 && h > 0) {
        const ratio = w / h;
        return ratio >= 0.9 && ratio <= 1.1;
      }
    }
  }
  // Fall back to width/height attrs
  const widthMatch = svg.match(/<svg[^>]*\swidth\s*=\s*["']([\d.]+)/);
  const heightMatch = svg.match(/<svg[^>]*\sheight\s*=\s*["']([\d.]+)/);
  if (widthMatch && heightMatch) {
    const w = Number(widthMatch[1]);
    const h = Number(heightMatch[1]);
    if (w > 0 && h > 0) {
      const ratio = w / h;
      return ratio >= 0.9 && ratio <= 1.1;
    }
  }
  // Indeterminate — don't fail validation on this alone.
  return true;
}

export function validateBrandConfig(config: BrandConfig): ValidationResult {
  const errors: ValidationError[] = [];

  // Common fields
  if (!config.name || !config.name.trim()) {
    errors.push({ field: 'name', message: 'name is required and cannot be empty' });
  }
  if (!config.colors?.brand) {
    errors.push({ field: 'colors.brand', message: 'colors.brand is required' });
  }

  // Mode-specific validation
  if (config.mode === 'icon+text') {
    if (!config.icon) {
      errors.push({
        field: 'icon',
        message: "mode 'icon+text' requires `icon` (square SVG path)",
        hint: 'e.g. icon: "/src/brand/icon.svg"',
      });
    } else if (!fileExists(config.icon)) {
      errors.push({
        field: 'icon',
        message: `icon file not found: ${config.icon}`,
        hint: 'Check the path is relative to project root and the file exists',
      });
    } else {
      const svg = readSvg(config.icon);
      if (svg && !isSvgRoughlySquare(svg)) {
        errors.push({
          field: 'icon',
          message: `icon at ${config.icon} does not appear to be square (1:1)`,
          hint: 'Favicons require a square source. Adjust the SVG viewBox or use a different file.',
        });
      }
    }
    if (!config.wordmark?.text && !config.name) {
      errors.push({ field: 'wordmark.text', message: 'wordmark.text required (or set BrandConfig.name)' });
    }
  } else if (config.mode === 'text-only') {
    if (!config.faviconGlyph) {
      errors.push({
        field: 'faviconGlyph',
        message: "mode 'text-only' requires `faviconGlyph` — there is no automated way to generate a square favicon from text alone",
        hint: 'Add faviconGlyph: { text: "I", font: "Manrope", weight: 800, bg: "var(--color-brand-500)", fg: "#fff" }',
      });
    } else {
      if (!config.faviconGlyph.text || config.faviconGlyph.text.length === 0) {
        errors.push({ field: 'faviconGlyph.text', message: 'faviconGlyph.text required (1-2 characters)' });
      } else if (config.faviconGlyph.text.length > 2) {
        errors.push({
          field: 'faviconGlyph.text',
          message: `faviconGlyph.text should be 1-2 characters (got ${config.faviconGlyph.text.length})`,
          hint: 'Longer strings do not render legibly at 16px',
        });
      }
    }
  } else if (config.mode === 'lockup') {
    if (!config.lockup) {
      errors.push({
        field: 'lockup',
        message: "mode 'lockup' requires `lockup` (horizontal SVG path)",
      });
    } else if (!fileExists(config.lockup)) {
      errors.push({
        field: 'lockup',
        message: `lockup file not found: ${config.lockup}`,
      });
    }
    // Lockup mode REQUIRES either a separate icon or a glyph for favicons
    const hasIcon = !!config.icon && fileExists(config.icon);
    const hasGlyph = !!config.faviconGlyph?.text;
    if (!hasIcon && !hasGlyph) {
      errors.push({
        field: 'icon/faviconGlyph',
        message: "mode 'lockup' requires EITHER `icon` (separate square SVG) OR `faviconGlyph` for favicons. Auto-cropping a lockup produces poor results and is not supported.",
        hint: 'Add icon: "/src/brand/icon.svg" — or — faviconGlyph: { ... }',
      });
    }
    if (config.icon && fileExists(config.icon)) {
      const svg = readSvg(config.icon);
      if (svg && !isSvgRoughlySquare(svg)) {
        errors.push({
          field: 'icon',
          message: `icon at ${config.icon} does not appear to be square`,
        });
      }
    }
  } else {
    errors.push({
      field: 'mode',
      // @ts-expect-error — defensive
      message: `unknown mode: ${config.mode}`,
      hint: "Valid modes: 'icon+text', 'text-only', 'lockup'",
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Format validation errors as a CLI-friendly multi-line string. Used by both
 * the brand:generate command and `indigo doctor`.
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((e) => {
      const lines = [`  ✗ [${e.field}] ${e.message}`];
      if (e.hint) lines.push(`    → ${e.hint}`);
      return lines.join('\n');
    })
    .join('\n');
}
