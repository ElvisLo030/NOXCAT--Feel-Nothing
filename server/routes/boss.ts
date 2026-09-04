import { randomUUID } from 'node:crypto';

import { Router } from 'express';
import { z } from 'zod';

import { BossDNASchema } from '../../src/ai/bossSchema.js';
import { DEFAULT_ANNOYANCE } from '../../src/ai/fallbackBoss.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.js';
import { generateBoss } from '../services/generateBoss.js';

const BossRequestSchema = z
  .object({
    annoyance: z
      .string()
      .transform((value) => value.trim())
      .refine((value) => Array.from(value).length <= 80, {
        message: 'annoyance must contain at most 80 Unicode characters',
      }),
    locale: z.literal('zh-TW').optional().default('zh-TW'),
  })
  .strict();

/** A fresh router owns a fresh in-memory limiter, which also keeps app instances isolated in tests. */
export function createBossRouter(): Router {
  const bossRouter = Router();

  bossRouter.post('/', createRateLimitMiddleware(), async (request, response) => {
    const requestId = randomUUID();
    response.setHeader('X-Request-Id', requestId);

    const parsedRequest = BossRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json({ error: 'invalid_request', requestId });
      return;
    }

    const annoyance = parsedRequest.data.annoyance || DEFAULT_ANNOYANCE;
    const result = await generateBoss(annoyance, { requestId });
    const verifiedBoss = BossDNASchema.safeParse(result.boss);

    // Keep a final trust boundary at the HTTP response even for local code paths.
    if (!verifiedBoss.success) {
      console.error(`[boss:${requestId}] internal schema validation failed`);
      response.status(500).json({ error: 'boss_generation_failed', requestId });
      return;
    }

    response.status(200).json({ source: result.source, boss: verifiedBoss.data });
  });

  return bossRouter;
}
