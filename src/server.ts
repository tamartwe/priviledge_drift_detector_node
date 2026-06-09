import express from 'express';
import type { EventController } from './controllers/event.controller.js';
import type { AnomalyController } from './controllers/anomaly.controller.js';
import type { AlertController } from './controllers/alert.controller.js';

export function createServer(
  eventController: EventController,
  anomalyController: AnomalyController,
  alertController: AlertController,
): express.Application {
  const app = express();
  app.use(express.json());

  app.post('/events', eventController.submit);
  app.post('/events/batch', eventController.submitBatch);

  app.get('/alerts', alertController.list);
  app.get('/alerts/:alertId', alertController.get);

  app.get('/anomalies', anomalyController.list);
  app.get('/stats', anomalyController.stats);
  app.get('/health', anomalyController.health);

  return app;
}
