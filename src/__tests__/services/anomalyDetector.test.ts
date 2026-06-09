import { AnomalyDetector } from "../../services/anomalyDetector.js";
import { appWhitelist } from "../../config/whitelist.js";
import { makeEvent, atUTCHour, hoursAgo } from "../fixtures.js";
import type { AnomalyType } from "../../models/anomaly.model.js";

// Helper: run the detector and return only the anomaly types found
function detect(detector: AnomalyDetector, overrides = {}) {
  return detector.analyze(makeEvent(overrides)).map((a) => a.type);
}

describe("AnomalyDetector", () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    detector = new AnomalyDetector();
  });

  // ── Clean events ────────────────────────────────────────────────────────────

  it("returns no anomalies for a normal, in-hours, single-level privilege change", () => {
    const types = detect(detector, {
      previousPermission: "read",
      newPermission: "write",
      timestamp: atUTCHour(10),
    });
    expect(types).toHaveLength(0);
  });

  // ── PRIVILEGE_ESCALATION ────────────────────────────────────────────────────

  describe("PRIVILEGE_ESCALATION", () => {
    it("fires when permission jumps more than one level", () => {
      const types = detect(detector, {
        previousPermission: "none",
        newPermission: "admin",
      });
      expect(types).toContain<AnomalyType>("PRIVILEGE_ESCALATION");
    });

    it("does NOT fire for a single-level jump", () => {
      const types = detect(detector, {
        previousPermission: "read",
        newPermission: "write",
      });
      expect(types).not.toContain<AnomalyType>("PRIVILEGE_ESCALATION");
    });

    it("does NOT fire for a downgrade", () => {
      const types = detect(detector, {
        previousPermission: "admin",
        newPermission: "read",
      });
      expect(types).not.toContain<AnomalyType>("PRIVILEGE_ESCALATION");
    });
  });

  // ── SUPERADMIN_GRANT ────────────────────────────────────────────────────────

  describe("SUPERADMIN_GRANT", () => {
    it("fires when newPermission is superadmin", () => {
      const types = detect(detector, {
        previousPermission: "admin",
        newPermission: "superadmin",
      });
      expect(types).toContain<AnomalyType>("SUPERADMIN_GRANT");
    });

    it("does NOT fire when newPermission is admin", () => {
      const types = detect(detector, {
        previousPermission: "write",
        newPermission: "admin",
        timestamp: atUTCHour(10),
      });
      expect(types).not.toContain<AnomalyType>("SUPERADMIN_GRANT");
    });
  });

  // ── ADMIN_PRIVILEGE_GAIN ────────────────────────────────────────────────────

  describe("ADMIN_PRIVILEGE_GAIN", () => {
    it("fires when a user gains admin from below-admin", () => {
      const types = detect(detector, {
        previousPermission: "write",
        newPermission: "admin",
        timestamp: atUTCHour(10),
      });
      expect(types).toContain<AnomalyType>("ADMIN_PRIVILEGE_GAIN");
    });

    it("fires when a user gains superadmin from below-admin", () => {
      const types = detect(detector, {
        previousPermission: "write",
        newPermission: "superadmin",
      });
      expect(types).toContain<AnomalyType>("ADMIN_PRIVILEGE_GAIN");
    });

    it("does NOT fire when user was already admin-or-above", () => {
      const types = detect(detector, {
        previousPermission: "admin",
        newPermission: "superadmin",
      });
      expect(types).not.toContain<AnomalyType>("ADMIN_PRIVILEGE_GAIN");
    });

    it("does NOT fire when newPermission is below admin", () => {
      const types = detect(detector, {
        previousPermission: "none",
        newPermission: "write",
        timestamp: atUTCHour(10),
      });
      expect(types).not.toContain<AnomalyType>("ADMIN_PRIVILEGE_GAIN");
    });
  });

  // ── SELF_ESCALATION ─────────────────────────────────────────────────────────

  describe("SELF_ESCALATION", () => {
    it("fires when the actor raises their own permission", () => {
      const types = detect(detector, {
        actorId: "eve",
        targetUserId: "eve",
        previousPermission: "read",
        newPermission: "write",
        timestamp: atUTCHour(10),
      });
      expect(types).toContain<AnomalyType>("SELF_ESCALATION");
    });

    it("does NOT fire when actorId != targetUserId", () => {
      const types = detect(detector, {
        actorId: "admin",
        targetUserId: "user",
        previousPermission: "read",
        newPermission: "write",
        timestamp: atUTCHour(10),
      });
      expect(types).not.toContain<AnomalyType>("SELF_ESCALATION");
    });

    it("does NOT fire when actor demotes themselves", () => {
      const types = detect(detector, {
        actorId: "eve",
        targetUserId: "eve",
        previousPermission: "admin",
        newPermission: "read",
        timestamp: atUTCHour(10),
      });
      expect(types).not.toContain<AnomalyType>("SELF_ESCALATION");
    });
  });

  // ── OFF_HOURS_CHANGE ────────────────────────────────────────────────────────

  describe("OFF_HOURS_CHANGE", () => {
    it("fires when change is made before working hours", () => {
      const types = detect(detector, { timestamp: atUTCHour(3) });
      expect(types).toContain<AnomalyType>("OFF_HOURS_CHANGE");
    });

    it("fires when change is made after working hours", () => {
      const types = detect(detector, { timestamp: atUTCHour(22) });
      expect(types).toContain<AnomalyType>("OFF_HOURS_CHANGE");
    });

    it("does NOT fire during working hours", () => {
      const types = detect(detector, { timestamp: atUTCHour(10) });
      expect(types).not.toContain<AnomalyType>("OFF_HOURS_CHANGE");
    });
  });

  // ── UNKNOWN_APP ─────────────────────────────────────────────────────────────

  describe("UNKNOWN_APP", () => {
    it("fires when appId is present and not in the whitelist", () => {
      const types = detect(detector, {
        appId: "rogue-app",
        timestamp: atUTCHour(10),
      });
      expect(types).toContain<AnomalyType>("UNKNOWN_APP");
    });

    it("does NOT fire when appId is a known whitelisted app", () => {
      const knownApp = [...appWhitelist][0]!;
      const types = detect(detector, {
        appId: knownApp,
        timestamp: atUTCHour(10),
      });
      expect(types).not.toContain<AnomalyType>("UNKNOWN_APP");
    });

    it("does NOT fire when appId is absent", () => {
      const types = detect(detector, { timestamp: atUTCHour(10) });
      expect(types).not.toContain<AnomalyType>("UNKNOWN_APP");
    });
  });

  // ── RAPID_CHANGES (burst window) ────────────────────────────────────────────

  describe("RAPID_CHANGES", () => {
    it("fires on the 5th change by the same actor within the burst window", () => {
      const actor = "speed-demon";
      const recent = new Date().toISOString();

      for (let i = 0; i < 4; i++) {
        detector.analyze(makeEvent({ actorId: actor, targetUserId: `u${i}`, timestamp: recent }));
      }
      const types = detect(detector, {
        actorId: actor,
        targetUserId: "u5",
        timestamp: recent,
      });
      expect(types).toContain<AnomalyType>("RAPID_CHANGES");
    });

    it("does NOT fire if fewer than 5 changes in the burst window", () => {
      const actor = "slow-actor";
      const recent = new Date().toISOString();

      for (let i = 0; i < 3; i++) {
        detector.analyze(makeEvent({ actorId: actor, targetUserId: `u${i}`, timestamp: recent }));
      }
      const types = detect(detector, { actorId: actor, timestamp: recent });
      expect(types).not.toContain<AnomalyType>("RAPID_CHANGES");
    });
  });

  // ── EXCESSIVE_CHANGES_24H ───────────────────────────────────────────────────

  describe("EXCESSIVE_CHANGES_24H", () => {
    it("fires when the same actor exceeds 5 changes in 24 hours", () => {
      const actor = "daily-abuser";

      // 5 changes spread over the past 23 hours — all within 24h window
      for (let i = 0; i < 5; i++) {
        detector.analyze(
          makeEvent({ actorId: actor, targetUserId: `u${i}`, timestamp: hoursAgo(23 - i) })
        );
      }
      // 6th change — should trigger EXCESSIVE_CHANGES_24H
      const types = detect(detector, {
        actorId: actor,
        targetUserId: "u6",
        timestamp: new Date().toISOString(),
      });
      expect(types).toContain<AnomalyType>("EXCESSIVE_CHANGES_24H");
    });

    it("does NOT fire for 5 or fewer changes in 24 hours", () => {
      const actor = "modest-actor";

      for (let i = 0; i < 4; i++) {
        detector.analyze(
          makeEvent({ actorId: actor, targetUserId: `u${i}`, timestamp: hoursAgo(10 - i) })
        );
      }
      const types = detect(detector, {
        actorId: actor,
        timestamp: new Date().toISOString(),
      });
      expect(types).not.toContain<AnomalyType>("EXCESSIVE_CHANGES_24H");
    });

    it("does NOT count events older than 24 hours", () => {
      const actor = "old-news";

      // 5 stale events, well outside the 24h window
      for (let i = 0; i < 5; i++) {
        detector.analyze(
          makeEvent({ actorId: actor, targetUserId: `u${i}`, timestamp: hoursAgo(25 + i) })
        );
      }
      const types = detect(detector, {
        actorId: actor,
        timestamp: new Date().toISOString(),
      });
      expect(types).not.toContain<AnomalyType>("EXCESSIVE_CHANGES_24H");
    });
  });

  // ── BLAST_RADIUS ────────────────────────────────────────────────────────────

  describe("BLAST_RADIUS", () => {
    it("fires when actor affects 3+ distinct users in the burst window", () => {
      const actor = "mass-granter";
      const ts = new Date().toISOString();

      detector.analyze(makeEvent({ actorId: actor, targetUserId: "u1", timestamp: ts }));
      detector.analyze(makeEvent({ actorId: actor, targetUserId: "u2", timestamp: ts }));
      const types = detect(detector, { actorId: actor, targetUserId: "u3", timestamp: ts });
      expect(types).toContain<AnomalyType>("BLAST_RADIUS");
    });

    it("does NOT fire when same user is targeted multiple times", () => {
      const actor = "focused-actor";
      const ts = new Date().toISOString();

      detector.analyze(makeEvent({ actorId: actor, targetUserId: "same-user", timestamp: ts }));
      detector.analyze(makeEvent({ actorId: actor, targetUserId: "same-user", timestamp: ts }));
      const types = detect(detector, {
        actorId: actor,
        targetUserId: "same-user",
        timestamp: ts,
      });
      expect(types).not.toContain<AnomalyType>("BLAST_RADIUS");
    });
  });
});
