import { randomUUID } from "crypto";
import type { PermissionChangeEvent } from "../models/event.model.js";
import type { Anomaly } from "../models/anomaly.model.js";
import type { Alert } from "../models/alert.model.js";

/** Build a minimal valid PermissionChangeEvent, override any field you need. */
export function makeEvent(
  overrides: Partial<PermissionChangeEvent> = {}
): PermissionChangeEvent {
  return {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    actorId: "actor-a",
    targetUserId: "user-b",
    resourceId: "resource-x",
    previousPermission: "read",
    newPermission: "write",
    ...overrides,
  };
}

/** Build a minimal valid Anomaly. */
export function makeAnomaly(overrides: Partial<Anomaly> = {}): Anomaly {
  return {
    anomalyId: randomUUID(),
    detectedAt: new Date().toISOString(),
    type: "PRIVILEGE_ESCALATION",
    severity: "HIGH",
    triggeringEventId: randomUUID(),
    actorId: "actor-a",
    targetUserId: "user-b",
    description: "Test anomaly",
    ...overrides,
  };
}

/** An ISO timestamp at the given UTC hour (today). */
export function atUTCHour(hour: number): string {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** An ISO timestamp N hours ago from now. */
export function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

/** Build a minimal valid Alert. */
export function makeAlert(overrides: Partial<Alert> = {}): Alert {
  const event = overrides.event ?? makeEvent();
  const anomaly = overrides.anomalies?.[0] ?? makeAnomaly();
  return {
    alertId: randomUUID(),
    createdAt: new Date().toISOString(),
    event,
    anomalies: [anomaly],
    reasons: [anomaly.description],
    highestSeverity: anomaly.severity,
    ...overrides,
  };
}
