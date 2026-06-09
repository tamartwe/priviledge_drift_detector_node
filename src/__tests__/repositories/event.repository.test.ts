import { InMemoryEventRepository } from "../../repositories/event.repository.js";
import { makeEvent } from "../fixtures.js";

describe("InMemoryEventRepository", () => {
  let repo: InMemoryEventRepository;

  beforeEach(() => {
    repo = new InMemoryEventRepository();
  });

  describe("save / findById", () => {
    it("stores an event and retrieves it by id", () => {
      const event = makeEvent({ eventId: "evt-1" });
      repo.save(event);

      expect(repo.findById("evt-1")).toEqual(event);
    });

    it("returns undefined for an unknown id", () => {
      expect(repo.findById("does-not-exist")).toBeUndefined();
    });

    it("overwrites an existing event when saved with the same id", () => {
      const first = makeEvent({ eventId: "evt-dup", actorId: "alice" });
      const second = makeEvent({ eventId: "evt-dup", actorId: "bob" });

      repo.save(first);
      repo.save(second);

      expect(repo.findById("evt-dup")?.actorId).toBe("bob");
    });
  });

  describe("findAll", () => {
    it("returns an empty array when the store is empty", () => {
      expect(repo.findAll()).toEqual([]);
    });

    it("returns all saved events", () => {
      const e1 = makeEvent({ eventId: "a" });
      const e2 = makeEvent({ eventId: "b" });
      repo.save(e1);
      repo.save(e2);

      expect(repo.findAll()).toHaveLength(2);
      expect(repo.findAll()).toEqual(expect.arrayContaining([e1, e2]));
    });
  });

  describe("count", () => {
    it("returns 0 initially", () => {
      expect(repo.count()).toBe(0);
    });

    it("reflects the number of distinct events saved", () => {
      repo.save(makeEvent({ eventId: "x" }));
      repo.save(makeEvent({ eventId: "y" }));
      expect(repo.count()).toBe(2);
    });

    it("does not double-count when the same id is saved twice", () => {
      repo.save(makeEvent({ eventId: "same" }));
      repo.save(makeEvent({ eventId: "same" }));
      expect(repo.count()).toBe(1);
    });
  });
});
