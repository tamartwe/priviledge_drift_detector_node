import { InMemoryAnomalyRepository } from "../../repositories/anomaly.repository.js";
import { makeAnomaly } from "../fixtures.js";

describe("InMemoryAnomalyRepository", () => {
  let repo: InMemoryAnomalyRepository;

  beforeEach(() => {
    repo = new InMemoryAnomalyRepository();
  });

  // ── save / saveMany ─────────────────────────────────────────────────────────

  describe("save / saveMany", () => {
    it("save appends one anomaly", () => {
      repo.save(makeAnomaly());
      expect(repo.count()).toBe(1);
    });

    it("saveMany appends multiple anomalies at once", () => {
      repo.saveMany([makeAnomaly(), makeAnomaly(), makeAnomaly()]);
      expect(repo.count()).toBe(3);
    });
  });

  // ── query ───────────────────────────────────────────────────────────────────

  describe("query", () => {
    beforeEach(() => {
      repo.saveMany([
        makeAnomaly({ severity: "CRITICAL", type: "SUPERADMIN_GRANT", actorId: "eve" }),
        makeAnomaly({ severity: "HIGH", type: "SELF_ESCALATION", actorId: "mallory" }),
        makeAnomaly({ severity: "HIGH", type: "RAPID_CHANGES", actorId: "mallory" }),
        makeAnomaly({ severity: "MEDIUM", type: "OFF_HOURS_CHANGE", actorId: "eve" }),
        makeAnomaly({ severity: "LOW", type: "BLAST_RADIUS", actorId: "alice" }),
      ]);
    });

    it("returns all anomalies when no filters are applied", () => {
      expect(repo.query({ limit: 100 })).toHaveLength(5);
    });

    it("filters by severity", () => {
      const results = repo.query({ severity: "HIGH", limit: 100 });
      expect(results).toHaveLength(2);
      expect(results.every((a) => a.severity === "HIGH")).toBe(true);
    });

    it("filters by type", () => {
      const results = repo.query({ type: "RAPID_CHANGES", limit: 100 });
      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe("RAPID_CHANGES");
    });

    it("filters by actorId", () => {
      const results = repo.query({ actorId: "mallory", limit: 100 });
      expect(results).toHaveLength(2);
      expect(results.every((a) => a.actorId === "mallory")).toBe(true);
    });

    it("combines multiple filters with AND semantics", () => {
      const results = repo.query({ actorId: "eve", severity: "CRITICAL", limit: 100 });
      expect(results).toHaveLength(1);
      expect(results[0]?.type).toBe("SUPERADMIN_GRANT");
    });

    it("respects the limit — returns the N most recent", () => {
      const results = repo.query({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it("returns empty array when no anomalies match the filter", () => {
      expect(repo.query({ severity: "CRITICAL", actorId: "alice", limit: 100 })).toEqual([]);
    });
  });

  // ── countBySeverity ─────────────────────────────────────────────────────────

  describe("countBySeverity", () => {
    it("returns all-zero counts on an empty store", () => {
      const counts = repo.countBySeverity();
      expect(counts).toEqual({ LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 });
    });

    it("correctly tallies each severity bucket", () => {
      repo.saveMany([
        makeAnomaly({ severity: "CRITICAL" }),
        makeAnomaly({ severity: "HIGH" }),
        makeAnomaly({ severity: "HIGH" }),
        makeAnomaly({ severity: "MEDIUM" }),
      ]);
      const counts = repo.countBySeverity();
      expect(counts.CRITICAL).toBe(1);
      expect(counts.HIGH).toBe(2);
      expect(counts.MEDIUM).toBe(1);
      expect(counts.LOW).toBe(0);
    });
  });

  // ── countByType ─────────────────────────────────────────────────────────────

  describe("countByType", () => {
    it("returns all-zero counts on an empty store", () => {
      const counts = repo.countByType();
      expect(counts.PRIVILEGE_ESCALATION).toBe(0);
      expect(counts.UNKNOWN_APP).toBe(0);
    });

    it("correctly tallies each type bucket", () => {
      repo.saveMany([
        makeAnomaly({ type: "PRIVILEGE_ESCALATION" }),
        makeAnomaly({ type: "PRIVILEGE_ESCALATION" }),
        makeAnomaly({ type: "UNKNOWN_APP" }),
      ]);
      const counts = repo.countByType();
      expect(counts.PRIVILEGE_ESCALATION).toBe(2);
      expect(counts.UNKNOWN_APP).toBe(1);
    });
  });
});
