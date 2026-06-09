import { z } from 'zod';
import { randomUUID } from 'crypto';

export const AnomalyTypeSchema = z.enum([
  // ── Pre-existing rules ────────────────────────────────────────────────────
  'PRIVILEGE_ESCALATION', // permission jumps more than 1 level at once
  'RAPID_CHANGES', // >N changes by same actor in a short burst window
  'OFF_HOURS_CHANGE', // change made outside working hours
  'SELF_ESCALATION', // actor raises their own permission
  'BLAST_RADIUS', // actor touches many distinct users in burst window
  'SUPERADMIN_GRANT', // any grant of superadmin privilege
  // ── New rules ─────────────────────────────────────────────────────────────
  'ADMIN_PRIVILEGE_GAIN', // user gains admin-or-above privilege
  'EXCESSIVE_CHANGES_24H', // same user has >5 privilege changes in rolling 24 h
  'UNKNOWN_APP', // event emitted by an app not in the whitelist
]);

export const AnomalySeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const AnomalySchema = z.object({
  anomalyId: z.string().uuid().default(() => randomUUID()),
  detectedAt: z.string().datetime().default(() => new Date().toISOString()),
  type: AnomalyTypeSchema,
  severity: AnomalySeveritySchema,
  triggeringEventId: z.string(),
  actorId: z.string(),
  targetUserId: z.string(),
  description: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/** Query params for GET /anomalies */
export const AnomalyQuerySchema = z.object({
  severity: AnomalySeveritySchema.optional(),
  type: AnomalyTypeSchema.optional(),
  actorId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000)
    .optional()
    .default(100),
});

export type AnomalyType = z.infer<typeof AnomalyTypeSchema>;
export type AnomalySeverity = z.infer<typeof AnomalySeveritySchema>;
export type Anomaly = z.infer<typeof AnomalySchema>;
export type AnomalyQuery = z.infer<typeof AnomalyQuerySchema>;
