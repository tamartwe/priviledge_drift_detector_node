# Privilege Drift Escalator — Node.js

An async HTTP service that ingests a stream of permission-change events, detects privilege-drift anomalies in real time, and surfaces flagged events as structured alerts.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| HTTP | Express v5 |
| Validation | Zod v4 |
| Logging | Pino + pino-pretty (dev) |
| Tests | Jest + ts-jest |
| Linting | ESLint 9 + Airbnb base + typescript-eslint |

---

## Architecture

```
src/
├── models/          Zod schemas + inferred TypeScript types
├── repositories/    In-memory data access layer (event, anomaly, alert)
├── services/        Business logic (EventQueue, AnomalyDetector, FileLoader)
├── controllers/     HTTP request handlers (event, anomaly, alert)
├── config/          App whitelist
├── lib/             Shared utilities (logger)
└── index.ts         Composition root / DI wiring
```

Events flow through an async FIFO queue and are processed in order:

```
POST /events  →  EventQueue  →  AnomalyDetector  →  AlertRepository
                    (FIFO)          (rules)           (composite alert)
```

---

## HTTP API

| Method | Path | Description |
|---|---|---|
| `POST` | `/events` | Submit a single permission-change event |
| `POST` | `/events/batch` | Submit an array of events (max 1 000) |
| `GET` | `/alerts` | Flagged events with reasons (`?actorId`, `?severity`, `?type`, `?since`, `?limit`) |
| `GET` | `/alerts/:alertId` | Single alert detail |
| `GET` | `/anomalies` | Raw anomaly detections (`?severity`, `?type`, `?actorId`, `?limit`) |
| `GET` | `/stats` | Queue throughput + anomaly counts |
| `GET` | `/health` | Liveness check |

### Event payload

```json
{
  "actorId": "alice",
  "targetUserId": "bob",
  "resourceId": "prod-db",
  "previousPermission": "read",
  "newPermission": "admin",
  "appId": "iam-service",
  "timestamp": "2026-06-09T10:00:00Z"
}
```

`previousPermission` / `newPermission` must be one of: `none | read | write | admin | superadmin`.

---

## Detection rules

| Rule | Severity | Trigger |
|---|---|---|
| `ADMIN_PRIVILEGE_GAIN` | HIGH / CRITICAL | User gains `admin` or `superadmin` from a lower level |
| `SUPERADMIN_GRANT` | CRITICAL | Any grant of `superadmin` |
| `PRIVILEGE_ESCALATION` | HIGH | Permission jumps more than one level in a single change |
| `SELF_ESCALATION` | HIGH | Actor raises their own permissions |
| `EXCESSIVE_CHANGES_24H` | HIGH | Same actor makes > 5 changes in a rolling 24-hour window |
| `RAPID_CHANGES` | HIGH | Same actor makes ≥ 5 changes within a 5-minute burst window |
| `BLAST_RADIUS` | MEDIUM | Actor affects ≥ 3 distinct users in the burst window |
| `OFF_HOURS_CHANGE` | MEDIUM | Change made outside 08:00–20:00 UTC |
| `UNKNOWN_APP` | MEDIUM | `appId` present but not in the configured whitelist |

---

## Getting started

```bash
npm install
npm run dev                          # start with ts-node
PORT=3001 npm run dev                # custom port
EVENTS_FILE=./sample-events.json npm run dev   # seed from JSON file on startup
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `LOG_LEVEL` | `info` | Pino log level (`trace \| debug \| info \| warn \| error`) |
| `NODE_ENV` | — | Set to `production` for JSON logging |
| `EVENTS_FILE` | — | Path to a JSON file to seed events from on startup |
| `WHITELISTED_APPS` | — | Comma-separated extra app IDs added to the whitelist |

### App whitelist

Built-in: `iam-service`, `admin-portal`, `auth-gateway`, `provisioning-worker`, `ci-pipeline`.

Extend at runtime:

```bash
WHITELISTED_APPS=my-service,another-tool npm run dev
```

---

## Scripts

```bash
npm run build          # compile TypeScript → dist/
npm start              # run compiled output
npm run dev            # run with ts-node (development)
npm run typecheck      # type-check without emitting
npm test               # run Jest test suite
npm run test:coverage  # run tests with coverage report
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
```

---

## Tests

116 tests across 8 suites covering every layer:

```
src/__tests__/
├── repositories/   event, anomaly, alert (save, query, filters, counters)
├── services/       EventQueue (FIFO, drain, error recovery)
│                   AnomalyDetector (one positive + one negative test per rule)
└── controllers/    EventController, AnomalyController, AlertController
                    (HTTP status codes, validation errors, repo integration)
```

```bash
npm test
# Test Suites: 8 passed  |  Tests: 116 passed
```
