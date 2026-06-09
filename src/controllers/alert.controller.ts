import type { Request, Response } from 'express';
import { AlertQuerySchema } from '../models/alert.model.js';
import type { IAlertRepository } from '../repositories/alert.repository.js';

export class AlertController {
  constructor(private readonly alertRepo: IAlertRepository) {}

  /**
   * GET /alerts
   *
   * Query params:
   *   actorId  — filter by the actor who made the change
   *   severity — minimum severity: LOW | MEDIUM | HIGH | CRITICAL
   *   type     — anomaly type that must be present in the alert
   *   since    — ISO 8601 datetime; only alerts for events at or after this time
   *   limit    — max results to return (default 100, max 1000)
   *
   * Results are returned in event-processing order (oldest first within the page).
   */
  list = (req: Request, res: Response): void => {
    const parsed = AlertQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }

    const alerts = this.alertRepo.query(parsed.data);

    res.json({
      total: this.alertRepo.count(),
      returned: alerts.length,
      alerts: alerts.map((a) => ({
        alertId: a.alertId,
        createdAt: a.createdAt,
        highestSeverity: a.highestSeverity,
        reasons: a.reasons,
        event: {
          eventId: a.event.eventId,
          timestamp: a.event.timestamp,
          actorId: a.event.actorId,
          targetUserId: a.event.targetUserId,
          resourceId: a.event.resourceId,
          previousPermission: a.event.previousPermission,
          newPermission: a.event.newPermission,
          appId: a.event.appId,
        },
        anomalies: a.anomalies.map((n) => ({
          anomalyId: n.anomalyId,
          type: n.type,
          severity: n.severity,
          description: n.description,
        })),
      })),
    });
  };

  /** GET /alerts/:alertId */
  get = (req: Request, res: Response): void => {
    const { alertId } = req.params as { alertId: string };
    const alert = this.alertRepo.findById(alertId);

    if (alert === undefined) {
      res.status(404).json({ error: `Alert '${alertId}' not found.` });
      return;
    }

    res.json(alert);
  };
}
