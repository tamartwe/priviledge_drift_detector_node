import { z, ZodError } from 'zod';
import type { Request, Response } from 'express';
import { CreateEventSchema } from '../models/event.model.js';
import { AlertSchema } from '../models/alert.model.js';
import logger from '../lib/logger.js';
import type { IEventRepository } from '../repositories/event.repository.js';
import type { IAnomalyRepository } from '../repositories/anomaly.repository.js';
import type { IAlertRepository } from '../repositories/alert.repository.js';
import { highestSeverity } from '../repositories/alert.repository.js';
import type { EventQueue } from '../services/eventQueue.js';
import type { AnomalyDetector } from '../services/anomalyDetector.js';

const log = logger.child({ component: 'EventController' });

export class EventController {
  constructor(
    private readonly eventRepo: IEventRepository,
    private readonly anomalyRepo: IAnomalyRepository,
    private readonly alertRepo: IAlertRepository,
    private readonly queue: EventQueue,
    private readonly detector: AnomalyDetector,
  ) {}

  /** POST /events */
  submit = (req: Request, res: Response): void => {
    const parsed = CreateEventSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        issues: formatZodError(parsed.error),
      });
      return;
    }

    const event = parsed.data;
    this.queue.enqueue(event);

    res.status(202).json({
      accepted: true,
      eventId: event.eventId,
      queueSize: this.queue.size,
    });
  };

  /** POST /events/batch — accepts an array of events, validates each independently */
  submitBatch = (req: Request, res: Response): void => {
    const BatchSchema = z.array(CreateEventSchema).min(1).max(1000);
    const parsed = BatchSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        issues: formatZodError(parsed.error),
      });
      return;
    }

    const events = parsed.data;
    events.forEach((e) => this.queue.enqueue(e));

    res.status(202).json({
      accepted: true,
      count: events.length,
      queueSize: this.queue.size,
    });
  };

  /**
   * Queue processor — runs the detector, persists results, builds an Alert
   * when any anomalies fire. Called by EventQueue drain loop, not by Express.
   */
  process = async (event: Parameters<EventQueue['enqueue']>[0]): Promise<void> => {
    this.eventRepo.save(event);

    const anomalies = this.detector.analyze(event);

    if (anomalies.length === 0) {
      log.info(
        {
          eventId: event.eventId,
          actorId: event.actorId,
          previousPermission: event.previousPermission,
          newPermission: event.newPermission,
        },
        'Event processed — no anomalies',
      );
      return;
    }

    this.anomalyRepo.saveMany(anomalies);

    const alert = AlertSchema.parse({
      event,
      anomalies,
      reasons: anomalies.map((a) => a.description),
      highestSeverity: highestSeverity(anomalies.map((a) => a.severity)),
    });
    this.alertRepo.save(alert);

    log.warn(
      {
        alertId: alert.alertId,
        eventId: event.eventId,
        actorId: event.actorId,
        highestSeverity: alert.highestSeverity,
        anomalyCount: anomalies.length,
        types: anomalies.map((a) => a.type),
      },
      'Alert raised',
    );
  };
}

function formatZodError(err: ZodError): { path: string; message: string }[] {
  return err.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
