import { z } from 'zod';

export const PatternIdSchema = z.enum([
  'paper_rain',
  'comment_crossfire',
  'deadline_beam',
  'closing_walls',
  'revision_homing',
  'returnable_burst',
]);

export const AttackStepSchema = z
  .object({
    pattern: PatternIdSchema,
    intensity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    durationMs: z.number().int().min(4_500).max(9_000),
  })
  .strict();

export const BossDNASchema = z
  .object({
    schemaVersion: z.literal(1),
    seed: z.number().int().min(1).max(2_147_483_647),
    bossName: z.string().min(2).max(24),
    openingLine: z.string().min(1).max(42),
    weakPointLabel: z.string().min(1).max(12),
    theme: z.enum(['office', 'school', 'social', 'bug', 'weather', 'daily']),
    attacks: z.array(AttackStepSchema).length(3),
    resultLine: z.string().min(1).max(48),
  })
  .strict();

export type PatternId = z.infer<typeof PatternIdSchema>;
export type AttackStep = z.infer<typeof AttackStepSchema>;
export type BossDNA = z.infer<typeof BossDNASchema>;
