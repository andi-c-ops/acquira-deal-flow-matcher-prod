import { z } from "zod";

export const dailyRunSchema = z.object({
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
  cursorStartOverride: z.string().datetime().nullable().optional(),
  cursorEndOverride: z.string().datetime().nullable().optional(),
  skipNotifications: z.boolean().optional(),
  deferDelivery: z.boolean().optional(),
});

export const clickupWorkerSchema = z.object({
  dryRun: z.boolean().optional(),
  maxJobs: z.number().int().positive().max(100).optional(),
  force: z.boolean().optional(),
  skipNotifications: z.boolean().optional(),
});

export const newAeCheckSchema = z.object({
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
});

export const newAeEventSchema = z.object({
  source: z.string().min(1),
  submissionKey: z.string().min(1),
  submittedAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export const replayRunSchema = z.object({
  runId: z.string().uuid(),
  mode: z.literal("recompute_and_redeliver"),
  dryRun: z.boolean().optional(),
});

export const replayAeSchema = z.object({
  aeThesisId: z.string().uuid(),
  lookbackDays: z.number().int().positive().max(365).optional(),
  dryRun: z.boolean().optional(),
});
