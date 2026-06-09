import { InMemoryEventRepository } from './repositories/event.repository.js';
import { InMemoryAnomalyRepository } from './repositories/anomaly.repository.js';
import { InMemoryAlertRepository } from './repositories/alert.repository.js';
import { EventQueue } from './services/eventQueue.js';
import { AnomalyDetector } from './services/anomalyDetector.js';
import { loadEventsFromFile } from './services/fileLoader.js';
import { EventController } from './controllers/event.controller.js';
import { AnomalyController } from './controllers/anomaly.controller.js';
import { AlertController } from './controllers/alert.controller.js';
import { appWhitelist } from './config/whitelist.js';
import { createServer } from './server.js';
import logger from './lib/logger.js';

const log = logger.child({ component: 'Bootstrap' });

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const { EVENTS_FILE } = process.env;

// ─── Repositories ──────────────────────────────────────────────────────────────
const eventRepo = new InMemoryEventRepository();
const anomalyRepo = new InMemoryAnomalyRepository();
const alertRepo = new InMemoryAlertRepository();

// ─── Services ─────────────────────────────────────────────────────────────────
const queue = new EventQueue();
const detector = new AnomalyDetector();

// ─── Controllers ──────────────────────────────────────────────────────────────
const eventController = new EventController(eventRepo, anomalyRepo, alertRepo, queue, detector);
const anomalyController = new AnomalyController(anomalyRepo, eventRepo, queue);
const alertController = new AlertController(alertRepo);

// ─── Wire queue processor ──────────────────────────────────────────────────────
queue.register(eventController.process);

// ─── HTTP server ───────────────────────────────────────────────────────────────
const app = createServer(eventController, anomalyController, alertController);

app.listen(PORT, () => {
  log.info(
    {
      port: PORT,
      whitelistedApps: [...appWhitelist],
      routes: [
        'POST /events',
        'POST /events/batch',
        'GET  /alerts',
        'GET  /alerts/:id',
        'GET  /anomalies',
        'GET  /stats',
        'GET  /health',
      ],
    },
    'Privilege Drift Escalator started',
  );

  if (EVENTS_FILE !== undefined) {
    try {
      const result = loadEventsFromFile(EVENTS_FILE, queue);
      log.info(
        { accepted: result.accepted, rejected: result.rejected, total: result.total },
        'Seed file loaded',
      );
    } catch (err) {
      log.error({ err, EVENTS_FILE }, 'Failed to load seed events file');
    }
  }
});
