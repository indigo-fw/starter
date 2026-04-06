/**
 * core-affiliates module registration entrypoint.
 */

// Routers
export { affiliatesRouter } from './routers/affiliates';
export { attributionsRouter } from './routers/attributions';

// Schema
export { saasAffiliates, saasReferrals, saasAffiliateEvents } from './schema/affiliates';
export { saasUserAcquisitions } from './schema/attributions';

// Lib
export { captureReferral, recordConversion } from './lib/affiliates';
export { captureAttribution } from './lib/attribution';
export type { AttributionData } from './lib/attribution';

// Dependencies
export { setAffiliatesDeps, getAffiliatesDeps } from './deps';
export type { AffiliatesDeps } from './deps';

// Components
export { AttributionCapture } from './components/AttributionCapture';
