import { randomUUID } from 'crypto';
import { AnomalySchema } from '../models/anomaly.model.js';
import { PERMISSION_RANK } from '../models/event.model.js';
import { isKnownApp } from '../config/whitelist.js';
import type { Anomaly, AnomalyType } from '../models/anomaly.model.js';
import type { PermissionChangeEvent } from '../models/event.model.js';

// ─── Thresholds ────────────────────────────────────────────────────────────────
const BURST_WINDOW_MS = 5 * 60 * 1000; // 5-minute burst window
const BURST_THRESHOLD = 5; // max changes before RAPID_CHANGES fires
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24-hour rolling window
const DAILY_THRESHOLD = 5; // max changes before EXCESSIVE_CHANGES_24H fires
const BLAST_RADIUS_THRESHOLD = 3; // distinct users affected in burst window
const WORK_HOUR_START_UTC = 8;
const WORK_HOUR_END_UTC = 20;

// ─── Per-actor sliding window state ───────────────────────────────────────────
//
// Windows are keyed by actorId (the account *making* changes), not targetUserId
// (the account *receiving* changes). This is an intentional design choice:
//
//   Actor-keyed  → detects a compromised/abusive admin: one account rapidly
//                  escalating many others (insider threat, credential breach,
//                  runaway automation). This is the primary concern for a
//                  privilege-change monitoring system.
//
//   Target-keyed → would detect privilege cycling on a specific user: Bob's
//                  permissions being changed repeatedly, possibly by different
//                  actors. That pattern is partially covered by BLAST_RADIUS
//                  (which counts distinct targetUserIds per actor burst window).
//
// If the requirement is interpreted as "flag the target user who experiences
// too many changes", swap the Map key to targetUserId and update the rule
// descriptions. Both readings of "same user has >5 changes" are defensible;
// actor-keyed was chosen because it maps more directly to abuse-of-privilege.
interface ActorWindow {
  burstEvents: PermissionChangeEvent[]; // 5-min window for burst / blast-radius
  dailyEvents: PermissionChangeEvent[]; // 24-h window for excessive-changes rule
  affectedUsers: Set<string>; // distinct targets in burst window
}

export class AnomalyDetector {
  private readonly actorWindows = new Map<string, ActorWindow>();

  analyze(event: PermissionChangeEvent): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const nowMs = new Date(event.timestamp).getTime();

    // ── Stateless rules ──────────────────────────────────────────────────────
    this.push(checkPrivilegeEscalation(event), anomalies);
    this.push(checkSuperadminGrant(event), anomalies);
    this.push(checkAdminPrivilegeGain(event), anomalies);
    this.push(checkSelfEscalation(event), anomalies);
    this.push(checkOffHours(event), anomalies);
    this.push(checkUnknownApp(event), anomalies);

    // ── Stateful rules (sliding windows) ─────────────────────────────────────
    const window = this.getWindow(event.actorId);
    this.pruneWindows(window, nowMs);

    window.burstEvents.push(event);
    window.dailyEvents.push(event);
    window.affectedUsers.add(event.targetUserId);

    this.push(checkRapidChanges(event, window), anomalies);
    this.push(checkExcessiveChanges24h(event, window), anomalies);
    this.push(checkBlastRadius(event, window), anomalies);

    return anomalies;
  }

  private push(result: Anomaly | null, acc: Anomaly[]): void {
    if (result !== null) acc.push(result);
  }

  private getWindow(actorId: string): ActorWindow {
    let w = this.actorWindows.get(actorId);
    if (w === undefined) {
      w = { burstEvents: [], dailyEvents: [], affectedUsers: new Set() };
      this.actorWindows.set(actorId, w);
    }
    return w;
  }

  private pruneWindows(window: ActorWindow, nowMs: number): void {
    window.burstEvents = window.burstEvents.filter(
      (e) => nowMs - new Date(e.timestamp).getTime() < BURST_WINDOW_MS,
    );
    window.dailyEvents = window.dailyEvents.filter(
      (e) => nowMs - new Date(e.timestamp).getTime() < DAILY_WINDOW_MS,
    );
    // Rebuild affected users from the current burst window only
    window.affectedUsers = new Set(window.burstEvents.map((e) => e.targetUserId));
  }
}

// ─── Rule implementations ──────────────────────────────────────────────────────

function checkPrivilegeEscalation(event: PermissionChangeEvent): Anomaly | null {
  const delta = PERMISSION_RANK[event.newPermission] - PERMISSION_RANK[event.previousPermission];
  if (delta <= 1) return null;

  return build(
    'PRIVILEGE_ESCALATION',
    'HIGH',
    event,
    `Permission jumped from '${event.previousPermission}' to '${event.newPermission}' (${delta} levels) in one change.`,
  );
}

function checkSuperadminGrant(event: PermissionChangeEvent): Anomaly | null {
  if (event.newPermission !== 'superadmin') return null;

  return build(
    'SUPERADMIN_GRANT',
    'CRITICAL',
    event,
    `Superadmin privilege granted to '${event.targetUserId}' on resource '${event.resourceId}'.`,
  );
}

/**
 * NEW — fires whenever a user gains admin-or-above privilege,
 * regardless of where they came from.
 */
function checkAdminPrivilegeGain(event: PermissionChangeEvent): Anomaly | null {
  const isAdminOrAbove = PERMISSION_RANK[event.newPermission] >= PERMISSION_RANK.admin;
  const wasAlreadyAdmin = PERMISSION_RANK[event.previousPermission] >= PERMISSION_RANK.admin;

  if (!isAdminOrAbove || wasAlreadyAdmin) return null;

  const severity = event.newPermission === 'superadmin' ? 'CRITICAL' : 'HIGH';
  return build(
    'ADMIN_PRIVILEGE_GAIN',
    severity,
    event,
    `User '${event.targetUserId}' gained '${event.newPermission}' privilege on resource '${event.resourceId}'.`,
  );
}

function checkSelfEscalation(event: PermissionChangeEvent): Anomaly | null {
  if (event.actorId !== event.targetUserId) return null;
  const promoted = PERMISSION_RANK[event.newPermission] > PERMISSION_RANK[event.previousPermission];
  if (!promoted) return null;

  return build(
    'SELF_ESCALATION',
    'HIGH',
    event,
    `User '${event.actorId}' elevated their own permissions from '${event.previousPermission}' to '${event.newPermission}'.`,
  );
}

function checkOffHours(event: PermissionChangeEvent): Anomaly | null {
  const hour = new Date(event.timestamp).getUTCHours();
  if (hour >= WORK_HOUR_START_UTC && hour < WORK_HOUR_END_UTC) return null;

  return build(
    'OFF_HOURS_CHANGE',
    'MEDIUM',
    event,
    `Permission change at UTC hour ${hour} falls outside working hours (${WORK_HOUR_START_UTC}:00–${WORK_HOUR_END_UTC}:00).`,
    { utcHour: hour },
  );
}

/**
 * NEW — fires when an event's appId is not in the configured whitelist.
 * Events with no appId are skipped (appId is optional).
 */
function checkUnknownApp(event: PermissionChangeEvent): Anomaly | null {
  if (event.appId === undefined) return null;
  if (isKnownApp(event.appId)) return null;

  return build(
    'UNKNOWN_APP',
    'MEDIUM',
    event,
    `Event emitted by unrecognised application '${event.appId}' — not present in the app whitelist.`,
    { appId: event.appId },
  );
}

function checkRapidChanges(event: PermissionChangeEvent, window: ActorWindow): Anomaly | null {
  if (window.burstEvents.length < BURST_THRESHOLD) return null;

  return build(
    'RAPID_CHANGES',
    'HIGH',
    event,
    `Actor '${event.actorId}' made ${window.burstEvents.length} permission changes within ${BURST_WINDOW_MS / 60_000} minutes.`,
    { changesInWindow: window.burstEvents.length },
  );
}

/**
 * NEW — fires when the same actor exceeds DAILY_THRESHOLD permission changes
 * inside a rolling 24-hour window.
 */
function checkExcessiveChanges24h(
  event: PermissionChangeEvent,
  window: ActorWindow,
): Anomaly | null {
  if (window.dailyEvents.length <= DAILY_THRESHOLD) return null;

  return build(
    'EXCESSIVE_CHANGES_24H',
    'HIGH',
    event,
    `Actor '${event.actorId}' has made ${window.dailyEvents.length} permission changes in the last 24 hours (threshold: ${DAILY_THRESHOLD}).`,
    { changesIn24h: window.dailyEvents.length, threshold: DAILY_THRESHOLD },
  );
}

function checkBlastRadius(event: PermissionChangeEvent, window: ActorWindow): Anomaly | null {
  if (window.affectedUsers.size < BLAST_RADIUS_THRESHOLD) return null;

  return build(
    'BLAST_RADIUS',
    'MEDIUM',
    event,
    `Actor '${event.actorId}' affected ${window.affectedUsers.size} distinct users in the last ${BURST_WINDOW_MS / 60_000} minutes.`,
    { distinctUsersAffected: window.affectedUsers.size },
  );
}

// ─── Builder ───────────────────────────────────────────────────────────────────

function build(
  type: AnomalyType,
  severity: Anomaly['severity'],
  event: PermissionChangeEvent,
  description: string,
  context?: Record<string, unknown>,
): Anomaly {
  return AnomalySchema.parse({
    anomalyId: randomUUID(),
    detectedAt: new Date().toISOString(),
    type,
    severity,
    triggeringEventId: event.eventId,
    actorId: event.actorId,
    targetUserId: event.targetUserId,
    description,
    context,
  });
}
