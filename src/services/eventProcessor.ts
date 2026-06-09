import { AlertSchema } from '../models/alert.model.js';
import type { PermissionChangeEvent } from '../models/event.model.js';
import logger from '../lib/logger.js';
import type { IEventRepository } from '../repositories/event.repository.js';
import type { IAnomalyRepository } from '../repositories/anomaly.repository.js';
import type { IAlertRepository } from '../repositories/alert.repository.js';
import { highestSeverity } from '../repositories/alert.repository.js';
import type { AnomalyDetector } from './anomalyDetector.js';

const log = logger.child({ component: 'EventProcessorService' });

/**
 * Owns the full lifecycle of a dequeued event:
 *   1. Persist the raw event.
 *   2. Run anomaly detection.
 *   3. If anomalies fired, persist them and assemble + persist an Alert.
 *
 * Has no knowledge of HTTP — it is registered as the EventQueue processor
 * callback by the composition root (index.ts).
 */
export class EventProcessorService {
  constructor(
    private readonly eventRepo: IEventRepository,
    private readonly anomalyRepo: IAnomalyRepository,
    private readonly alertRepo: IAlertRepository,
    private readonly detector: AnomalyDetector,
  ) {}

  process = async (event: PermissionChangeEvent): Promise<void> => {
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
