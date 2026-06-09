import type { Alert, AlertQuery } from '../models/alert.model.js';
import type { AnomalySeverity } from '../models/anomaly.model.js';

const SEVERITY_RANK: Record<AnomalySeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export interface IAlertRepository {
  save(alert: Alert): void;
  query(params: AlertQuery): Alert[];
  count(): number;
  findById(alertId: string): Alert | undefined;
}

/**
 * Append-only in-memory alert store.
 * Alerts are kept in insertion order (= event-processing order).
 */
export class InMemoryAlertRepository implements IAlertRepository {
  private readonly store: Alert[] = [];

  private readonly index = new Map<string, Alert>();

  save(alert: Alert): void {
    this.store.push(alert);
    this.index.set(alert.alertId, alert);
  }

  findById(alertId: string): Alert | undefined {
    return this.index.get(alertId);
  }

  query({
    actorId, severity, type, since, limit,
  }: AlertQuery): Alert[] {
    let results = this.store as Alert[];

    if (actorId !== undefined) {
      results = results.filter((a) => a.event.actorId === actorId);
    }

    if (severity !== undefined) {
      const minRank = SEVERITY_RANK[severity];
      results = results.filter((a) => SEVERITY_RANK[a.highestSeverity] >= minRank);
    }

    if (type !== undefined) {
      results = results.filter((a) => a.anomalies.some((n) => n.type === type));
    }

    if (since !== undefined) {
      const sinceMs = new Date(since).getTime();
      results = results.filter(
        (a) => new Date(a.event.timestamp).getTime() >= sinceMs,
      );
    }

    // Return the N most recent
    return results.slice(-limit);
  }

  count(): number {
    return this.store.length;
  }
}

/** Derive the worst severity across a set of anomaly severities. */
export function highestSeverity(severities: AnomalySeverity[]): AnomalySeverity {
  return severities.reduce<AnomalySeverity>(
    (best, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[best] ? s : best),
    'LOW',
  );
}
