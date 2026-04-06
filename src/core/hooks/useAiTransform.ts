'use client';

import { useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';

/**
 * Returns a callback for AI text transformation in the editor.
 * Returns undefined if AI is not available (no router error means not configured).
 */
export function useAiTransform() {
  const aiMutation = trpc.ai.transform.useMutation();

  return useCallback(
    async (text: string, instruction: string): Promise<string> => {
      const result = await aiMutation.mutateAsync({ text, instruction });
      return result.result;
    },
    [aiMutation],
  );
}
