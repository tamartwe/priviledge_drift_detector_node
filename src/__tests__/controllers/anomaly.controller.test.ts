import { AnomalyController } from "../../controllers/anomaly.controller.js";
import { InMemoryAnomalyRepository } from "../../repositories/anomaly.repository.js";
import { InMemoryEventRepository } from "../../repositories/event.repository.js";
import { EventQueue } from "../../services/eventQueue.js";
import { mockRequest, mockResponse } from "./http-mocks.js";
import { makeAnomaly, makeEvent } from "../fixtures.js";

function makeController() {
  const anomalyRepo = new InMemoryAnomalyRepository();
  const eventRepo = new InMemoryEventRepository();
  const queue = new EventQueue();
  const controller = new AnomalyController(anomalyRepo, eventRepo, queue);
  return { controller, anomalyRepo, eventRepo, queue };
}

describe("AnomalyController", () => {
  // ── GET /anomalies ──────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns 200 with total and anomalies array when store is empty", () => {
      const { controller } = makeController();
      const res = mockResponse();

      controller.list(mockRequest(), res);

      expect(res._status).toBe(200);
      const body = res._json as { total: number; returned: number; anomalies: unknown[] };
      expect(body.total).toBe(0);
      expect(body.returned).toBe(0);
      expect(body.anomalies).toEqual([]);
    });

    it("returns all anomalies without filters", () => {
      const { controller, anomalyRepo } = makeController();
      anomalyRepo.saveMany([makeAnomaly(), makeAnomaly(), makeAnomaly()]);
      const res = mockResponse();

      controller.list(mockRequest(), res);

      const body = res._json as { total: number; returned: number };
      expect(body.total).toBe(3);
      expect(body.returned).toBe(3);
    });

    it("filters by severity query param", () => {
      const { controller, anomalyRepo } = makeController();
      anomalyRepo.saveMany([
        makeAnomaly({ severity: "CRITICAL" }),
        makeAnomaly({ severity: "HIGH" }),
        makeAnomaly({ severity: "HIGH" }),
      ]);
      const res = mockResponse();

      controller.list(mockRequest({ query: { severity: "HIGH" } }), res);

      const body = res._json as { returned: number };
      expect(body.returned).toBe(2);
    });

    it("filters by type query param", () => {
      const { controller, anomalyRepo } = makeController();
      anomalyRepo.saveMany([
        makeAnomaly({ type: "UNKNOWN_APP" }),
        makeAnomaly({ type: "SUPERADMIN_GRANT" }),
      ]);
      const res = mockResponse();

      controller.list(mockRequest({ query: { type: "UNKNOWN_APP" } }), res);

      const body = res._json as { returned: number };
      expect(body.returned).toBe(1);
    });

    it("filters by actorId query param", () => {
      const { controller, anomalyRepo } = makeController();
      anomalyRepo.saveMany([
        makeAnomaly({ actorId: "alice" }),
        makeAnomaly({ actorId: "bob" }),
        makeAnomaly({ actorId: "alice" }),
      ]);
      const res = mockResponse();

      controller.list(mockRequest({ query: { actorId: "alice" } }), res);

      const body = res._json as { returned: number };
      expect(body.returned).toBe(2);
    });

    it("respects the limit query param", () => {
      const { controller, anomalyRepo } = makeController();
      anomalyRepo.saveMany(Array.from({ length: 10 }, () => makeAnomaly()));
      const res = mockResponse();

      controller.list(mockRequest({ query: { limit: "3" } }), res);

      const body = res._json as { returned: number; total: number };
      expect(body.returned).toBe(3);
      expect(body.total).toBe(10);
    });

    it("returns 400 when severity is not a valid enum value", () => {
      const { controller } = makeController();
      const res = mockResponse();

      controller.list(mockRequest({ query: { severity: "EXTREME" } }), res);

      expect(res._status).toBe(400);
    });

    it("returns 400 when type is not a valid enum value", () => {
      const { controller } = makeController();
      const res = mockResponse();

      controller.list(mockRequest({ query: { type: "HACKED" } }), res);

      expect(res._status).toBe(400);
    });
  });

  // ── GET /stats ──────────────────────────────────────────────────────────────

  describe("stats", () => {
    it("returns queue counters from the queue instance", () => {
      const { controller, queue } = makeController();
      const res = mockResponse();

      controller.stats(mockRequest(), res);

      const body = res._json as {
        queue: { enqueued: number; processed: number; pending: number };
      };
      expect(body.queue.enqueued).toBe(queue.enqueued);
      expect(body.queue.processed).toBe(queue.processed);
      expect(body.queue.pending).toBe(queue.size);
    });

    it("returns event total from the event repository", () => {
      const { controller, eventRepo } = makeController();
      eventRepo.save(makeEvent());
      eventRepo.save(makeEvent());
      const res = mockResponse();

      controller.stats(mockRequest(), res);

      const body = res._json as { events: { total: number } };
      expect(body.events.total).toBe(2);
    });

    it("returns anomaly breakdowns from the anomaly repository", () => {
      const { controller, anomalyRepo } = makeController();
      anomalyRepo.saveMany([
        makeAnomaly({ severity: "CRITICAL" }),
        makeAnomaly({ severity: "HIGH" }),
      ]);
      const res = mockResponse();

      controller.stats(mockRequest(), res);

      const body = res._json as {
        anomalies: { total: number; bySeverity: Record<string, number> };
      };
      expect(body.anomalies.total).toBe(2);
      expect(body.anomalies.bySeverity["CRITICAL"]).toBe(1);
      expect(body.anomalies.bySeverity["HIGH"]).toBe(1);
    });
  });

  // ── GET /health ─────────────────────────────────────────────────────────────

  describe("health", () => {
    it("returns status ok", () => {
      const { controller } = makeController();
      const res = mockResponse();

      controller.health(mockRequest(), res);

      const body = res._json as { status: string };
      expect(body.status).toBe("ok");
    });

    it("includes a numeric uptime value", () => {
      const { controller } = makeController();
      const res = mockResponse();

      controller.health(mockRequest(), res);

      const body = res._json as { uptime: number };
      expect(typeof body.uptime).toBe("number");
    });
  });
});
