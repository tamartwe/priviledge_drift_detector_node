import type { Request, Response } from 'express';
import { AnomalyQuerySchema } from '../models/anomaly.model.js';
import type { IAnomalyRepository } from '../repositories/anomaly.repository.js';
import type { IEventRepository } from '../repositories/event.repository.js';
import type { EventQueue } from '../services/eventQueue.js';

export class AnomalyController {
  constructor(
    private readonly anomalyRepo: IAnomalyRepository,
    private readonly eventRepo: IEventRepository,
    private readonly queue: EventQueue,
  ) {}

  /** GET /anomalies */
  list = (req: Request, res: Response): void => {
    const parsed = AnomalyQuerySchema.safeParse(req.query);

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

    const anomalies = this.anomalyRepo.query(parsed.data);

    res.json({
      total: this.anomalyRepo.count(),
      returned: anomalies.length,
      anomalies,
    });
  };

  /** GET /stats */
  stats = (_req: Request, res: Response): void => {
    res.json({
      queue: {
        enqueued: this.queue.enqueued,
        processed: this.queue.processed,
        pending: this.queue.size,
      },
      events: {
        total: this.eventRepo.count(),
      },
      anomalies: {
        total: this.anomalyRepo.count(),
        bySeverity: this.anomalyRepo.countBySeverity(),
        byType: this.anomalyRepo.countByType(),
      },
    });
  };

  /** GET /health */
  health = (_req: Request, res: Response): void => {
    res.json({ status: 'ok', uptime: process.uptime() });
  };
}
