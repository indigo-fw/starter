/**
 * core-ai-writer module registration entrypoint.
 */

// Router
export { aiWriterRouter } from './routers/ai-writer';

// Lib
export { callAi } from './lib/ai-client';
export type { AiMessage, AiContentPart, AiCallOptions } from './lib/ai-client';
export { PROMPTS } from './lib/prompts';
