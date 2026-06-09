import { InMemoryAlertRepository } from "../../repositories/alert.repository.js";
import { highestSeverity } from "../../models/alert.model.js";
import { makeAlert, makeEvent, makeAnomaly, hoursAgo } from "../fixtures.js";

describe("InMemoryAlertRepository", () => {
  let repo: InMemoryAlertRepository;

  beforeEach(() => {
    repo = new InMemoryAlertRepository();
  });

  // ── save / findById ─────────────────────────────────────────────────────────

  describe("save / findById", () => {
    it("stores an alert and retrieves it by id", () => {
      const alert = makeAlert({ alertId: "alert-abc" });
      repo.save(alert);

      expect(repo.findById("alert-abc")).toEqual(alert);
    });

    it("returns undefined for an unknown id", () => {
      expect(repo.findById("nope")).toBeUndefined();
    });

    it("preserves insertion order across multiple saves", () => {
      const a1 = makeAlert({ alertId: "first" });
      const a2 = makeAlert({ alertId: "second" });
      const a3 = makeAlert({ alertId: "third" });

      repo.save(a1);
      repo.save(a2);
      repo.save(a3);

      const results = repo.query({ limit: 100 });
      expect(results.map((a) => a.alertId)).toEqual(["first", "second", "third"]);
    });
  });

  // ── count ───────────────────────────────────────────────────────────────────

  describe("count", () => {
    it("is 0 on an empty store", () => {
      expect(repo.count()).toBe(0);
    });

    it("increments with each save", () => {
      repo.save(makeAlert());
      repo.save(makeAlert());
      expect(repo.count()).toBe(2);
    });
  });

  // ── query — no filters ──────────────────────────────────────────────────────

  describe("query without filters", () => {
    it("returns empty array when store is empty", () => {
      expect(repo.query({ limit: 100 })).toEqual([]);
    });

    it("returns all alerts when no filters are applied", () => {
      repo.save(makeAlert());
      repo.save(makeAlert());
      expect(repo.query({ limit: 100 })).toHaveLength(2);
    });

    it("respects the limit — returns the N most recent", () => {
      for (let i = 0; i < 10; i++) repo.save(makeAlert());
      const results = repo.query({ limit: 3 });
      expect(results).toHaveLength(3);
    });
  });

  // ── query — actorId filter ──────────────────────────────────────────────────

  describe("query — actorId filter", () => {
    it("returns only alerts whose event.actorId matches", () => {
      repo.save(makeAlert({ event: makeEvent({ actorId: "alice" }) }));
      repo.save(makeAlert({ event: makeEvent({ actorId: "bob" }) }));
      repo.save(makeAlert({ event: makeEvent({ actorId: "alice" }) }));

      const results = repo.query({ actorId: "alice", limit: 100 });
      expect(results).toHaveLength(2);
      expect(results.every((a) => a.event.actorId === "alice")).toBe(true);
    });

    it("returns empty when no alert matches the given actorId", () => {
      repo.save(makeAlert({ event: makeEvent({ actorId: "bob" }) }));
      expect(repo.query({ actorId: "unknown", limit: 100 })).toEqual([]);
    });
  });

  // ── query — severity filter (minimum threshold) ─────────────────────────────

  describe("query — severity filter", () => {
    beforeEach(() => {
      repo.save(makeAlert({ highestSeverity: "LOW" }));
      repo.save(makeAlert({ highestSeverity: "MEDIUM" }));
      repo.save(makeAlert({ highestSeverity: "HIGH" }));
      repo.save(makeAlert({ highestSeverity: "CRITICAL" }));
    });

    it("severity=LOW returns all alerts", () => {
      expect(repo.query({ severity: "LOW", limit: 100 })).toHaveLength(4);
    });

    it("severity=MEDIUM returns MEDIUM and above", () => {
      const results = repo.query({ severity: "MEDIUM", limit: 100 });
      expect(results).toHaveLength(3);
      expect(results.map((a) => a.highestSeverity)).not.toContain("LOW");
    });

    it("severity=CRITICAL returns only CRITICAL alerts", () => {
      const results = repo.query({ severity: "CRITICAL", limit: 100 });
      expect(results).toHaveLength(1);
      expect(results[0]?.highestSeverity).toBe("CRITICAL");
    });
  });

  // ── query — type filter ─────────────────────────────────────────────────────

  describe("query — type filter", () => {
    it("returns alerts that contain at least one anomaly of the given type", () => {
      const withUnknownApp = makeAlert({
        anomalies: [
          makeAnomaly({ type: "UNKNOWN_APP" }),
          makeAnomaly({ type: "OFF_HOURS_CHANGE" }),
        ],
      });
      const withoutUnknownApp = makeAlert({
        anomalies: [makeAnomaly({ type: "SELF_ESCALATION" })],
      });

      repo.save(withUnknownApp);
      repo.save(withoutUnknownApp);

      const results = repo.query({ type: "UNKNOWN_APP", limit: 100 });
      expect(results).toHaveLength(1);
      expect(results[0]?.alertId).toBe(withUnknownApp.alertId);
    });
  });

  // ── query — since filter ────────────────────────────────────────────────────

  describe("query — since filter", () => {
    it("excludes alerts for events before the since timestamp", () => {
      repo.save(makeAlert({ event: makeEvent({ timestamp: hoursAgo(10) }) }));
      repo.save(makeAlert({ event: makeEvent({ timestamp: hoursAgo(5) }) }));
      repo.save(makeAlert({ event: makeEvent({ timestamp: hoursAgo(1) }) }));

      const since = hoursAgo(6);
      const results = repo.query({ since, limit: 100 });

      expect(results).toHaveLength(2);
      results.forEach((a) => {
        expect(new Date(a.event.timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(since).getTime()
        );
      });
    });

    it("returns all alerts when since is before the oldest event", () => {
      repo.save(makeAlert({ event: makeEvent({ timestamp: hoursAgo(2) }) }));
      repo.save(makeAlert({ event: makeEvent({ timestamp: hoursAgo(1) }) }));

      const results = repo.query({ since: hoursAgo(24), limit: 100 });
      expect(results).toHaveLength(2);
    });
  });

  // ── query — combined filters ────────────────────────────────────────────────

  describe("query — combined filters", () => {
    it("applies all filters with AND semantics", () => {
      repo.save(
        makeAlert({
          highestSeverity: "CRITICAL",
          event: makeEvent({ actorId: "eve", timestamp: hoursAgo(1) }),
          anomalies: [makeAnomaly({ type: "SUPERADMIN_GRANT" })],
        })
      );
      repo.save(
        makeAlert({
          highestSeverity: "HIGH",
          event: makeEvent({ actorId: "eve", timestamp: hoursAgo(2) }),
          anomalies: [makeAnomaly({ type: "SELF_ESCALATION" })],
        })
      );
      repo.save(
        makeAlert({
          highestSeverity: "CRITICAL",
          event: makeEvent({ actorId: "bob", timestamp: hoursAgo(1) }),
          anomalies: [makeAnomaly({ type: "SUPERADMIN_GRANT" })],
        })
      );

      const results = repo.query({
        actorId: "eve",
        severity: "CRITICAL",
        type: "SUPERADMIN_GRANT",
        limit: 100,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.event.actorId).toBe("eve");
      expect(results[0]?.highestSeverity).toBe("CRITICAL");
    });
  });
});

// ── highestSeverity helper ────────────────────────────────────────────────────

describe("highestSeverity", () => {
  it("returns the most severe value from the list", () => {
    expect(highestSeverity(["LOW", "HIGH", "MEDIUM"])).toBe("HIGH");
    expect(highestSeverity(["CRITICAL", "HIGH"])).toBe("CRITICAL");
    expect(highestSeverity(["LOW"])).toBe("LOW");
  });

  it("falls back to LOW for an empty list", () => {
    expect(highestSeverity([])).toBe("LOW");
  });
});
