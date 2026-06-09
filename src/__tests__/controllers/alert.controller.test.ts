import { AlertController } from "../../controllers/alert.controller.js";
import { InMemoryAlertRepository } from "../../repositories/alert.repository.js";
import { mockRequest, mockResponse } from "./http-mocks.js";
import { makeAlert, makeAnomaly, makeEvent, hoursAgo } from "../fixtures.js";

function makeController() {
  const repo = new InMemoryAlertRepository();
  const controller = new AlertController(repo);
  return { controller, repo };
}

describe("AlertController", () => {
  // ── GET /alerts ─────────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns 200 with empty alerts array when store is empty", () => {
      const { controller } = makeController();
      const res = mockResponse();

      controller.list(mockRequest(), res);

      expect(res._status).toBe(200);
      const body = res._json as { total: number; returned: number; alerts: unknown[] };
      expect(body.total).toBe(0);
      expect(body.returned).toBe(0);
      expect(body.alerts).toEqual([]);
    });

    it("returns the correct total and returned counts", () => {
      const { controller, repo } = makeController();
      repo.save(makeAlert());
      repo.save(makeAlert());
      repo.save(makeAlert());
      const res = mockResponse();

      controller.list(mockRequest(), res);

      const body = res._json as { total: number; returned: number };
      expect(body.total).toBe(3);
      expect(body.returned).toBe(3);
    });

    it("response shape includes alertId, highestSeverity, reasons, event, anomalies", () => {
      const { controller, repo } = makeController();
      repo.save(makeAlert());
      const res = mockResponse();

      controller.list(mockRequest(), res);

      const body = res._json as { alerts: Record<string, unknown>[] };
      const alert = body.alerts[0]!;
      expect(alert).toHaveProperty("alertId");
      expect(alert).toHaveProperty("highestSeverity");
      expect(alert).toHaveProperty("reasons");
      expect(alert).toHaveProperty("event");
      expect(alert).toHaveProperty("anomalies");
    });

    it("filters by actorId query param", () => {
      const { controller, repo } = makeController();
      repo.save(makeAlert({ event: makeEvent({ actorId: "alice" }) }));
      repo.save(makeAlert({ event: makeEvent({ actorId: "bob" }) }));
      const res = mockResponse();

      controller.list(mockRequest({ query: { actorId: "alice" } }), res);

      const body = res._json as { returned: number; alerts: { event: { actorId: string } }[] };
      expect(body.returned).toBe(1);
      expect(body.alerts[0]?.event.actorId).toBe("alice");
    });

    it("filters by severity (minimum threshold)", () => {
      const { controller, repo } = makeController();
      repo.save(makeAlert({ highestSeverity: "LOW" }));
      repo.save(makeAlert({ highestSeverity: "HIGH" }));
      repo.save(makeAlert({ highestSeverity: "CRITICAL" }));
      const res = mockResponse();

      controller.list(mockRequest({ query: { severity: "HIGH" } }), res);

      const body = res._json as { returned: number };
      expect(body.returned).toBe(2);
    });

    it("filters by anomaly type", () => {
      const { controller, repo } = makeController();
      repo.save(makeAlert({ anomalies: [makeAnomaly({ type: "UNKNOWN_APP" })] }));
      repo.save(makeAlert({ anomalies: [makeAnomaly({ type: "SELF_ESCALATION" })] }));
      const res = mockResponse();

      controller.list(mockRequest({ query: { type: "UNKNOWN_APP" } }), res);

      const body = res._json as { returned: number };
      expect(body.returned).toBe(1);
    });

    it("filters by since timestamp", () => {
      const { controller, repo } = makeController();
      repo.save(makeAlert({ event: makeEvent({ timestamp: hoursAgo(10) }) }));
      repo.save(makeAlert({ event: makeEvent({ timestamp: hoursAgo(1) }) }));
      const res = mockResponse();

      controller.list(mockRequest({ query: { since: hoursAgo(5) } }), res);

      const body = res._json as { returned: number };
      expect(body.returned).toBe(1);
    });

    it("respects the limit query param", () => {
      const { controller, repo } = makeController();
      for (let i = 0; i < 10; i++) repo.save(makeAlert());
      const res = mockResponse();

      controller.list(mockRequest({ query: { limit: "4" } }), res);

      const body = res._json as { returned: number; total: number };
      expect(body.returned).toBe(4);
      expect(body.total).toBe(10);
    });

    it("returns 400 for an invalid severity value", () => {
      const { controller } = makeController();
      const res = mockResponse();

      controller.list(mockRequest({ query: { severity: "EXTREME" } }), res);

      expect(res._status).toBe(400);
      const body = res._json as { error: string };
      expect(body.error).toBe("Invalid query parameters");
    });

    it("returns 400 for an invalid type value", () => {
      const { controller } = makeController();
      const res = mockResponse();

      controller.list(mockRequest({ query: { type: "FAKE_RULE" } }), res);

      expect(res._status).toBe(400);
    });

    it("returns 400 for a non-datetime since value", () => {
      const { controller } = makeController();
      const res = mockResponse();

      controller.list(mockRequest({ query: { since: "not-a-date" } }), res);

      expect(res._status).toBe(400);
    });
  });

  // ── GET /alerts/:alertId ─────────────────────────────────────────────────────

  describe("get", () => {
    it("returns the full alert when found", () => {
      const { controller, repo } = makeController();
      const alert = makeAlert({ alertId: "known-id" });
      repo.save(alert);

      const req = { ...mockRequest(), params: { alertId: "known-id" } };
      const res = mockResponse();

      controller.get(req as unknown as Parameters<typeof controller.get>[0], res);

      expect(res._status).toBe(200);
      const body = res._json as { alertId: string };
      expect(body.alertId).toBe("known-id");
    });

    it("returns 404 when the alertId does not exist", () => {
      const { controller } = makeController();

      const req = { ...mockRequest(), params: { alertId: "missing" } };
      const res = mockResponse();

      controller.get(req as unknown as Parameters<typeof controller.get>[0], res);

      expect(res._status).toBe(404);
      const body = res._json as { error: string };
      expect(body.error).toContain("missing");
    });
  });

  // ── EventController integration: process() creates an alert ─────────────────

  describe("EventProcessorService integration — alerts are created via process()", () => {
    it("creates one alert per flagged event regardless of how many anomalies fire", async () => {
      const { EventProcessorService } = await import("../../services/eventProcessor.js");
      const { InMemoryEventRepository } = await import("../../repositories/event.repository.js");
      const { InMemoryAnomalyRepository } = await import("../../repositories/anomaly.repository.js");
      const { AnomalyDetector } = await import("../../services/anomalyDetector.js");

      const alertRepo = new InMemoryAlertRepository();
      const processor = new EventProcessorService(
        new InMemoryEventRepository(),
        new InMemoryAnomalyRepository(),
        alertRepo,
        new AnomalyDetector(),
      );

      // Self-escalation to superadmin fires multiple anomalies but ONE alert
      await processor.process(
        makeEvent({
          actorId: "eve",
          targetUserId: "eve",
          previousPermission: "read",
          newPermission: "superadmin",
          timestamp: new Date(new Date().setUTCHours(2, 0, 0, 0)).toISOString(),
        })
      );

      expect(alertRepo.count()).toBe(1);

      const alert = alertRepo.query({ limit: 1 })[0]!;
      expect(alert.anomalies.length).toBeGreaterThan(1);
      expect(alert.reasons.length).toBe(alert.anomalies.length);
    });

    it("does NOT create an alert for a clean event", async () => {
      const { EventProcessorService } = await import("../../services/eventProcessor.js");
      const { InMemoryEventRepository } = await import("../../repositories/event.repository.js");
      const { InMemoryAnomalyRepository } = await import("../../repositories/anomaly.repository.js");
      const { AnomalyDetector } = await import("../../services/anomalyDetector.js");

      const alertRepo = new InMemoryAlertRepository();
      const processor = new EventProcessorService(
        new InMemoryEventRepository(),
        new InMemoryAnomalyRepository(),
        alertRepo,
        new AnomalyDetector(),
      );

      await processor.process(
        makeEvent({
          previousPermission: "read",
          newPermission: "write",
          timestamp: new Date(new Date().setUTCHours(10, 0, 0, 0)).toISOString(),
        })
      );

      expect(alertRepo.count()).toBe(0);
    });
  });
});
