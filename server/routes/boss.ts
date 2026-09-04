import { randomUUID } from 'node:crypto';

import { Router } from 'express';
import { z } from 'zod';

import {
  BossContinuationBatchSchema,
  BossDNASchema,
  BossInitialBatchSchema,
} from '../../src/ai/bossSchema.js';
import { DEFAULT_ANNOYANCE } from '../../src/ai/fallbackBoss.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.js';
import {
  generateBoss,
  generateBossContinuation,
  generateBossInitial,
} from '../services/generateBoss.js';

const AnnoyanceSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => Array.from(value).length <= 80, {
    message: 'annoyance must contain at most 80 Unicode characters',
  });

const LegacyBossRequestSchema = z
  .object({
    annoyance: AnnoyanceSchema,
    locale: z.literal('zh-TW').optional().default('zh-TW'),
  })
  .strict();

const InitialBossRequestSchema = z
  .object({
    stage: z.literal('initial'),
    annoyance: AnnoyanceSchema,
    locale: z.literal('zh-TW').optional().default('zh-TW'),
  })
  .strict();

const ContinuationBossRequestSchema = z
  .object({
    stage: z.literal('continuation'),
    annoyance: AnnoyanceSchema,
    bossName: z.string().min(2).max(24),
    previousLines: z.array(z.string().min(1).max(28)).length(6),
    locale: z.literal('zh-TW').optional().default('zh-TW'),
  })
  .strict();

const BossRequestSchema = z.union([
  InitialBossRequestSchema,
  ContinuationBossRequestSchema,
  LegacyBossRequestSchema,
]);

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

    if ('stage' in parsedRequest.data && parsedRequest.data.stage === 'initial') {
      const result = await generateBossInitial(annoyance, { requestId });
      const verifiedBoss = BossInitialBatchSchema.safeParse(result.boss);
      if (!verifiedBoss.success) {
        console.error(`[boss:${requestId}] initial schema validation failed`);
        response.status(500).json({ error: 'boss_generation_failed', requestId });
        return;
      }

      response.status(200).json({
        source: result.source,
        stage: 'initial',
        boss: verifiedBoss.data,
      });
      return;
    }

    if ('stage' in parsedRequest.data && parsedRequest.data.stage === 'continuation') {
      const result = await generateBossContinuation(
        annoyance,
        parsedRequest.data.bossName,
        parsedRequest.data.previousLines,
        { requestId },
      );
      const verifiedBatch = BossContinuationBatchSchema.safeParse({
        battleLines: result.battleLines,
      });
      if (!verifiedBatch.success) {
        console.error(`[boss:${requestId}] continuation schema validation failed`);
        response.status(500).json({ error: 'boss_generation_failed', requestId });
        return;
      }

      response.status(200).json({
        source: result.source,
        stage: 'continuation',
        battleLines: verifiedBatch.data.battleLines,
      });
      return;
    }

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
