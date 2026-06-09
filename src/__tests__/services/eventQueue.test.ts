import { EventQueue } from "../../services/eventQueue.js";
import { makeEvent } from "../fixtures.js";

describe("EventQueue", () => {
  let queue: EventQueue;

  beforeEach(() => {
    queue = new EventQueue();
  });

  // ── Counters ────────────────────────────────────────────────────────────────

  describe("counters", () => {
    it("starts with zero enqueued, processed and pending", () => {
      expect(queue.enqueued).toBe(0);
      expect(queue.processed).toBe(0);
      expect(queue.size).toBe(0);
    });

    it("increments enqueued on each call to enqueue()", () => {
      queue.enqueue(makeEvent());
      queue.enqueue(makeEvent());
      expect(queue.enqueued).toBe(2);
    });
  });

  // ── Processing ──────────────────────────────────────────────────────────────

  describe("drain loop", () => {
    it("calls the registered processor for each enqueued event", async () => {
      const processor = jest.fn().mockResolvedValue(undefined);
      queue.register(processor);

      queue.enqueue(makeEvent());
      queue.enqueue(makeEvent());

      // Let the microtask / setImmediate queue flush
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(processor).toHaveBeenCalledTimes(2);
    });

    it("processes events in FIFO order", async () => {
      const order: string[] = [];
      queue.register(async (e) => {
        order.push(e.eventId);
      });

      const e1 = makeEvent({ eventId: "first" });
      const e2 = makeEvent({ eventId: "second" });
      const e3 = makeEvent({ eventId: "third" });
      queue.enqueue(e1);
      queue.enqueue(e2);
      queue.enqueue(e3);

      await new Promise<void>((resolve) =>
        setTimeout(resolve, 20)
      );

      expect(order).toEqual(["first", "second", "third"]);
    });

    it("increments processed after each successful event", async () => {
      queue.register(async () => undefined);

      queue.enqueue(makeEvent());
      queue.enqueue(makeEvent());

      await new Promise<void>((resolve) => setTimeout(resolve, 20));

      expect(queue.processed).toBe(2);
    });

    it("continues processing after a processor error — does not crash", async () => {
      let calls = 0;
      queue.register(async () => {
        calls++;
        if (calls === 1) throw new Error("boom");
      });

      queue.enqueue(makeEvent());
      queue.enqueue(makeEvent());

      await new Promise<void>((resolve) => setTimeout(resolve, 20));

      expect(calls).toBe(2);
      // First event threw, so only the second increments processed
      expect(queue.processed).toBe(1);
    });

    it("does not process events when no processor is registered", async () => {
      queue.enqueue(makeEvent());

      await new Promise<void>((resolve) => setTimeout(resolve, 20));

      expect(queue.processed).toBe(0);
      // Item stays in queue because drain exits early (no processor)
    });

    it("queue size reaches 0 after all items are drained", async () => {
      queue.register(async () => undefined);

      queue.enqueue(makeEvent());
      queue.enqueue(makeEvent());

      await new Promise<void>((resolve) => setTimeout(resolve, 20));

      expect(queue.size).toBe(0);
    });
  });
});
