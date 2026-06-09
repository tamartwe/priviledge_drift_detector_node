import type {
  Anomaly, AnomalyQuery, AnomalySeverity, AnomalyType,
} from '../models/anomaly.model.js';

export interface IAnomalyRepository {
  save(anomaly: Anomaly): void;
  saveMany(anomalies: Anomaly[]): void;
  query(params: AnomalyQuery): Anomaly[];
  count(): number;
  countBySeverity(): Record<AnomalySeverity, number>;
  countByType(): Record<AnomalyType, number>;
}

export class InMemoryAnomalyRepository implements IAnomalyRepository {
  private readonly store: Anomaly[] = [];

  save(anomaly: Anomaly): void {
    this.store.push(anomaly);
  }

  saveMany(anomalies: Anomaly[]): void {
    this.store.push(...anomalies);
  }

  query({
    severity, type, actorId, limit,
  }: AnomalyQuery): Anomaly[] {
    let results = this.store as Anomaly[];

    if (severity !== undefined) results = results.filter((a) => a.severity === severity);
    if (type !== undefined) results = results.filter((a) => a.type === type);
    if (actorId !== undefined) results = results.filter((a) => a.actorId === actorId);

    return results.slice(-limit);
  }

  count(): number {
    return this.store.length;
  }

  countBySeverity(): Record<AnomalySeverity, number> {
    return this.store.reduce<Record<AnomalySeverity, number>>(
      (acc, a) => {
        acc[a.severity] = (acc[a.severity] ?? 0) + 1;
        return acc;
      },
      {
        LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0,
      },
    );
  }

  countByType(): Record<AnomalyType, number> {
    return this.store.reduce<Record<AnomalyType, number>>(
      (acc, a) => {
        acc[a.type] = (acc[a.type] ?? 0) + 1;
        return acc;
      },
      {
        PRIVILEGE_ESCALATION: 0,
        RAPID_CHANGES: 0,
        OFF_HOURS_CHANGE: 0,
        SELF_ESCALATION: 0,
        BLAST_RADIUS: 0,
        SUPERADMIN_GRANT: 0,
        ADMIN_PRIVILEGE_GAIN: 0,
        EXCESSIVE_CHANGES_24H: 0,
        UNKNOWN_APP: 0,
      },
    );
  }
}
