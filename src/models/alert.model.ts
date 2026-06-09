import { z } from 'zod';
import { randomUUID } from 'crypto';
import { PermissionChangeEventSchema } from './event.model.js';
import { AnomalySchema, AnomalySeveritySchema, AnomalyTypeSchema } from './anomaly.model.js';

export const AlertSchema = z.object({
  alertId: z.string().uuid().default(() => randomUUID()),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  /** The event that triggered this alert. */
  event: PermissionChangeEventSchema,
  /** Every anomaly that fired against this event. */
  anomalies: z.array(AnomalySchema).min(1),
  /** Short human-readable sentences, one per anomaly. */
  reasons: z.array(z.string()).min(1),
  /** The worst severity across all anomalies in this alert. */
  highestSeverity: AnomalySeveritySchema,
});

/** Query params accepted by GET /alerts */
export const AlertQuerySchema = z.object({
  actorId: z.string().optional(),
  severity: AnomalySeveritySchema.optional(),
  type: AnomalyTypeSchema.optional(),
  since: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(1000)
    .optional()
    .default(100),
});

export type Alert = z.infer<typeof AlertSchema>;
export type AlertQuery = z.infer<typeof AlertQuerySchema>;
