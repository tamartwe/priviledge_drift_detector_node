import { EventController } from "../../controllers/event.controller.js";
import { InMemoryEventRepository } from "../../repositories/event.repository.js";
import { InMemoryAnomalyRepository } from "../../repositories/anomaly.repository.js";
import { InMemoryAlertRepository } from "../../repositories/alert.repository.js";
import { EventQueue } from "../../services/eventQueue.js";
import { AnomalyDetector } from "../../services/anomalyDetector.js";
import { mockRequest, mockResponse } from "./http-mocks.js";

function makeController() {
  const eventRepo = new InMemoryEventRepository();
  const anomalyRepo = new InMemoryAnomalyRepository();
  const alertRepo = new InMemoryAlertRepository();
  const queue = new EventQueue();
  const detector = new AnomalyDetector();
  const controller = new EventController(eventRepo, anomalyRepo, alertRepo, queue, detector);
  return { controller, eventRepo, anomalyRepo, alertRepo, queue, detector };
}

const validBody = {
  actorId: "alice",
  targetUserId: "bob",
  resourceId: "billing",
  previousPermission: "read",
  newPermission: "write",
};

describe("EventController", () => {
  // ── submit (POST /events) ───────────────────────────────────────────────────

  describe("submit", () => {
    it("returns 202 and accepts a valid event", () => {
      const { controller } = makeController();
      const req = mockRequest({ body: validBody });
      const res = mockResponse();

      controller.submit(req, res);

      expect(res._status).toBe(202);
      expect((res._json as { accepted: boolean }).accepted).toBe(true);
    });

    it("auto-generates eventId and timestamp when not supplied", () => {
      const { controller } = makeController();
      const req = mockRequest({ body: validBody });
      const res = mockResponse();

      controller.submit(req, res);

      const body = res._json as { eventId: string };
      expect(typeof body.eventId).toBe("string");
      expect(body.eventId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("returns 400 when a required field is missing", () => {
      const { controller } = makeController();
      const req = mockRequest({ body: { actorId: "alice" } });
      const res = mockResponse();

      controller.submit(req, res);

      expect(res._status).toBe(400);
      const body = res._json as { error: string; issues: unknown[] };
      expect(body.error).toBe("Validation failed");
      expect(body.issues.length).toBeGreaterThan(0);
    });

    it("returns 400 when previousPermission is an unknown value", () => {
      const { controller } = makeController();
      const req = mockRequest({
        body: { ...validBody, previousPermission: "superuser" },
      });
      const res = mockResponse();

      controller.submit(req, res);

      expect(res._status).toBe(400);
    });

    it("enqueues the event to the queue", () => {
      const { controller, queue } = makeController();
      const req = mockRequest({ body: validBody });
      const res = mockResponse();

      controller.submit(req, res);

      expect(queue.enqueued).toBe(1);
    });

    it("reports the current queue size in the response", () => {
      const { controller } = makeController();
      const req = mockRequest({ body: validBody });
      const res = mockResponse();

      controller.submit(req, res);

      const body = res._json as { queueSize: number };
      expect(typeof body.queueSize).toBe("number");
    });
  });

  // ── submitBatch (POST /events/batch) ────────────────────────────────────────

  describe("submitBatch", () => {
    it("returns 202 and reports the count of accepted events", () => {
      const { controller } = makeController();
      const req = mockRequest({ body: [validBody, validBody] });
      const res = mockResponse();

      controller.submitBatch(req, res);

      expect(res._status).toBe(202);
      expect((res._json as { count: number }).count).toBe(2);
    });

    it("enqueues all events in the batch", () => {
      const { controller, queue } = makeController();
      const req = mockRequest({ body: [validBody, validBody, validBody] });
      const res = mockResponse();

      controller.submitBatch(req, res);

      expect(queue.enqueued).toBe(3);
    });

    it("returns 400 when the body is not an array", () => {
      const { controller } = makeController();
      const req = mockRequest({ body: validBody });
      const res = mockResponse();

      controller.submitBatch(req, res);

      expect(res._status).toBe(400);
    });

    it("returns 400 when the batch is empty", () => {
      const { controller } = makeController();
      const req = mockRequest({ body: [] });
      const res = mockResponse();

      controller.submitBatch(req, res);

      expect(res._status).toBe(400);
    });

    it("returns 400 when any item in the batch has an invalid field", () => {
      const { controller } = makeController();
      const req = mockRequest({
        body: [validBody, { ...validBody, newPermission: "root" }],
      });
      const res = mockResponse();

      controller.submitBatch(req, res);

      expect(res._status).toBe(400);
    });
  });

  // ── process (queue processor callback) ─────────────────────────────────────

  describe("process", () => {
    it("saves the event to the event repository", async () => {
      const { controller, eventRepo, queue } = makeController();
      queue.register(controller.process);

      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      controller.submit(req, res);

      await new Promise<void>((r) => setTimeout(r, 20));

      expect(eventRepo.count()).toBe(1);
    });

    it("saves detected anomalies to the anomaly repository", async () => {
      const { controller, anomalyRepo, queue } = makeController();
      queue.register(controller.process);

      // Self-escalation to superadmin — guaranteed to produce anomalies
      const req = mockRequest({
        body: {
          ...validBody,
          actorId: "eve",
          targetUserId: "eve",
          previousPermission: "read",
          newPermission: "superadmin",
        },
      });
      const res = mockResponse();
      controller.submit(req, res);

      await new Promise<void>((r) => setTimeout(r, 20));

      expect(anomalyRepo.count()).toBeGreaterThan(0);
    });

    it("does not write to the anomaly repo when no anomalies are detected", async () => {
      const { controller, anomalyRepo, queue } = makeController();
      queue.register(controller.process);

      const req = mockRequest({
        body: {
          ...validBody,
          timestamp: new Date(
            new Date().setUTCHours(10, 0, 0, 0)
          ).toISOString(),
        },
      });
      const res = mockResponse();
      controller.submit(req, res);

      await new Promise<void>((r) => setTimeout(r, 20));

      expect(anomalyRepo.count()).toBe(0);
    });
  });
});
