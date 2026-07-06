/**
 * core-brand module registration entrypoint.
 */

// Components
export { BrandLogo } from './components/BrandLogo';
export type { BrandLogoVariant } from './components/BrandLogo';

// Lib — DI + access
export {
  setBrandConfig,
  getBrandConfig,
  getBrandIconSvg,
  getBrandLockupSvg,
} from './lib/get-brand-config';
export { getBrandMetadata } from './lib/metadata';
export { validateBrandConfig, formatValidationErrors } from './lib/validate-config';
export type { ValidationError, ValidationResult } from './lib/validate-config';

// Types
export type {
  BrandConfig,
  BrandConfigIconText,
  BrandConfigTextOnly,
  BrandConfigLockup,
  BrandMode,
  FaviconGlyph,
  WordmarkConfig,
  BrandColors,
  OgImageConfig,
  PressConfig,
} from './types/brand-config';
