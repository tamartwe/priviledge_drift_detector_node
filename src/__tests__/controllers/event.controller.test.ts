import { EventController } from "../../controllers/event.controller.js";
import { EventQueue } from "../../services/eventQueue.js";
import { mockRequest, mockResponse } from "./http-mocks.js";

function makeController() {
  const queue = new EventQueue();
  const controller = new EventController(queue);
  return { controller, queue };
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
});
