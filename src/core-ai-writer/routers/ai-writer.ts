import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, sectionProcedure } from '@/server/trpc';
import { callAi } from '@/core-ai-writer/lib/ai-client';
import { PROMPTS } from '@/core-ai-writer/lib/prompts';
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('ai-writer');

const writerProcedure = sectionProcedure('content');

function requireAiResult(result: string | null): string {
  if (!result) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'AI is not configured. Set AI_API_KEY in your environment.',
    });
  }
  return result;
}

function parseJsonResult<T>(result: string): T {
  // Strip markdown code fences if present
  const cleaned = result.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'AI returned invalid JSON. Try again.',
    });
  }
}

export const aiWriterRouter = createTRPCRouter({
  /**
   * Generate a full blog post from a topic or outline.
   * Returns HTML content ready for the rich text editor.
   */
  generatePost: writerProcedure
    .input(z.object({
      topic: z.string().min(3).max(1000),
      tone: z.enum(['professional', 'casual', 'technical', 'friendly']).default('professional'),
      length: z.enum(['short', 'medium', 'long']).default('medium'),
      language: z.string().max(10).default('en'),
    }))
    .mutation(async ({ input }) => {
      const lengthGuide = {
        short: '400-600 words',
        medium: '800-1200 words',
        long: '1500-2500 words',
      };

      const result = await callAi({
        messages: [
          { role: 'system', content: PROMPTS.generatePost },
          {
            role: 'user',
            content: `Topic: ${input.topic}\nTone: ${input.tone}\nTarget length: ${lengthGuide[input.length]}\nLanguage: ${input.language}`,
          },
        ],
        maxTokens: input.length === 'long' ? 8000 : input.length === 'medium' ? 4000 : 2000,
      });

      return { content: requireAiResult(result) };
    }),

  /**
   * Generate a blog post outline from a topic.
   * Returns structured outline with sections and key points.
   */
  generateOutline: writerProcedure
    .input(z.object({
      topic: z.string().min(3).max(500),
      language: z.string().max(10).default('en'),
    }))
    .mutation(async ({ input }) => {
      const result = await callAi({
        messages: [
          { role: 'system', content: PROMPTS.generateOutline },
          { role: 'user', content: `Topic: ${input.topic}\nLanguage: ${input.language}` },
        ],
        maxTokens: 2000,
      });

      return parseJsonResult<{
        title: string;
        outline: { heading: string; points: string[] }[];
        estimatedWordCount: number;
        targetKeyword: string;
      }>(requireAiResult(result));
    }),

  /**
   * Generate SEO metadata from content.
   * Returns meta title, description, focus keyword, and keyword suggestions.
   */
  generateSeo: writerProcedure
    .input(z.object({
      title: z.string().max(500),
      content: z.string().min(10).max(50000),
      language: z.string().max(10).default('en'),
    }))
    .mutation(async ({ input }) => {
      // Strip HTML for cleaner analysis
      const textContent = input.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const truncated = textContent.slice(0, 5000);

      const result = await callAi({
        messages: [
          { role: 'system', content: PROMPTS.generateSeo },
          {
            role: 'user',
            content: `Title: ${input.title}\nLanguage: ${input.language}\n\nContent:\n${truncated}`,
          },
        ],
        maxTokens: 1000,
        temperature: 0.5,
      });

      return parseJsonResult<{
        metaTitle: string;
        metaDescription: string;
        focusKeyword: string;
        keywords: string[];
      }>(requireAiResult(result));
    }),

  /**
   * Analyze content for SEO improvements.
   * Returns a score and list of issues with fixes.
   */
  analyzeSeo: writerProcedure
    .input(z.object({
      title: z.string().max(500),
      content: z.string().min(10).max(50000),
      metaDescription: z.string().max(500).optional(),
      focusKeyword: z.string().max(100).optional(),
    }))
    .mutation(async ({ input }) => {
      const textContent = input.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const truncated = textContent.slice(0, 5000);

      const prompt = [
        `Title: ${input.title}`,
        input.metaDescription ? `Meta description: ${input.metaDescription}` : '',
        input.focusKeyword ? `Focus keyword: ${input.focusKeyword}` : '',
        `\nContent:\n${truncated}`,
      ].filter(Boolean).join('\n');

      const result = await callAi({
        messages: [
          { role: 'system', content: PROMPTS.improveSeo },
          { role: 'user', content: prompt },
        ],
        maxTokens: 2000,
        temperature: 0.3,
      });

      return parseJsonResult<{
        score: number;
        issues: { type: 'critical' | 'warning' | 'suggestion'; message: string; fix: string }[];
      }>(requireAiResult(result));
    }),

  /**
   * Translate content to a target language using AI.
   * Preserves HTML structure and shortcodes.
   */
  translate: writerProcedure
    .input(z.object({
      content: z.string().min(1).max(50000),
      targetLanguage: z.string().min(2).max(50),
      sourceLanguage: z.string().max(50).default('auto-detect'),
    }))
    .mutation(async ({ input }) => {
      const result = await callAi({
        messages: [
          { role: 'system', content: PROMPTS.translateContent },
          {
            role: 'user',
            content: `Translate to: ${input.targetLanguage}\nSource language: ${input.sourceLanguage}\n\n${input.content}`,
          },
        ],
        maxTokens: Math.min(input.content.length * 2, 16000),
      });

      return { content: requireAiResult(result) };
    }),

  /**
   * Generate alt text for an image using AI vision.
   * Accepts image URL (public or base64 data URL).
   */
  generateAltText: writerProcedure
    .input(z.object({
      imageUrl: z.string().min(1).max(10000),
      context: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
        {
          type: 'image_url',
          image_url: { url: input.imageUrl, detail: 'low' },
        },
      ];

      if (input.context) {
        userContent.push({ type: 'text', text: `Context: ${input.context}` });
      }

      const result = await callAi({
        messages: [
          { role: 'system', content: PROMPTS.generateAltText },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { role: 'user', content: userContent as any },
        ],
        maxTokens: 200,
        temperature: 0.3,
      });

      if (!result) {
        logger.warn('Alt text generation failed — AI not configured or vision not supported');
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI vision is not available. Ensure your AI provider supports image inputs.',
        });
      }

      return { altText: result };
    }),
});
