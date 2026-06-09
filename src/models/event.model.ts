import { z } from 'zod';
import { randomUUID } from 'crypto';

export const PermissionLevelSchema = z.enum([
  'none',
  'read',
  'write',
  'admin',
  'superadmin',
]);

export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

export const PERMISSION_RANK: Record<PermissionLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  admin: 3,
  superadmin: 4,
};

/** Schema for an inbound permission-change event (HTTP body) */
export const CreateEventSchema = z.object({
  eventId: z.string().uuid().default(() => randomUUID()),
  timestamp: z
    .string()
    .datetime({ offset: true })
    .default(() => new Date().toISOString()),
  actorId: z.string().min(1, 'actorId is required'),
  targetUserId: z.string().min(1, 'targetUserId is required'),
  resourceId: z.string().min(1, 'resourceId is required'),
  previousPermission: PermissionLevelSchema,
  newPermission: PermissionLevelSchema,
  /** The application / service that emitted this event. Used for whitelist enforcement. */
  appId: z.string().min(1).optional(),
  ipAddress: z.union([z.string().ipv4(), z.string().ipv6()]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Full persisted event (all fields guaranteed present) */
export const PermissionChangeEventSchema = CreateEventSchema.required({
  eventId: true,
  timestamp: true,
});

export type CreateEventInput = z.input<typeof CreateEventSchema>;
export type PermissionChangeEvent = z.infer<typeof PermissionChangeEventSchema>;
