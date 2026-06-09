import { EventProcessorService } from "../../services/eventProcessor.js";
import { InMemoryEventRepository } from "../../repositories/event.repository.js";
import { InMemoryAnomalyRepository } from "../../repositories/anomaly.repository.js";
import { InMemoryAlertRepository } from "../../repositories/alert.repository.js";
import { AnomalyDetector } from "../../services/anomalyDetector.js";
import { makeEvent } from "../fixtures.js";

function makeProcessor() {
  const eventRepo = new InMemoryEventRepository();
  const anomalyRepo = new InMemoryAnomalyRepository();
  const alertRepo = new InMemoryAlertRepository();
  const detector = new AnomalyDetector();
  const processor = new EventProcessorService(eventRepo, anomalyRepo, alertRepo, detector);
  return { processor, eventRepo, anomalyRepo, alertRepo, detector };
}

describe("EventProcessorService", () => {
  describe("process", () => {
    it("persists the event to the event repository", async () => {
      const { processor, eventRepo } = makeProcessor();
      const event = makeEvent({ previousPermission: "read", newPermission: "write" });

      await processor.process(event);

      expect(eventRepo.count()).toBe(1);
    });

    it("does not write to the anomaly or alert repos when no anomalies fire", async () => {
      const { processor, anomalyRepo, alertRepo } = makeProcessor();
      // Benign daytime read→write change, same actor ≠ target
      const event = makeEvent({
        previousPermission: "read",
        newPermission: "write",
        timestamp: new Date(new Date().setUTCHours(10, 0, 0, 0)).toISOString(),
      });

      await processor.process(event);

      expect(anomalyRepo.count()).toBe(0);
      expect(alertRepo.count()).toBe(0);
    });

    it("saves anomalies to the anomaly repository when they are detected", async () => {
      const { processor, anomalyRepo } = makeProcessor();
      // Self-escalation to superadmin guarantees multiple anomaly types
      const event = makeEvent({
        actorId: "eve",
        targetUserId: "eve",
        previousPermission: "read",
        newPermission: "superadmin",
      });

      await processor.process(event);

      expect(anomalyRepo.count()).toBeGreaterThan(0);
    });

    it("creates an alert in the alert repository when anomalies are detected", async () => {
      const { processor, alertRepo } = makeProcessor();
      const event = makeEvent({
        actorId: "eve",
        targetUserId: "eve",
        previousPermission: "read",
        newPermission: "superadmin",
      });

      await processor.process(event);

      expect(alertRepo.count()).toBe(1);
    });

    it("alert reasons match the anomaly descriptions", async () => {
      const { processor, anomalyRepo, alertRepo } = makeProcessor();
      const event = makeEvent({
        actorId: "eve",
        targetUserId: "eve",
        previousPermission: "read",
        newPermission: "superadmin",
      });

      await processor.process(event);

      const alerts = alertRepo.query({ limit: 10 });
      expect(alerts).toHaveLength(1);
      const alert = alerts[0]!;
      const descriptions = anomalyRepo.query({ limit: 1000 }).map((a) => a.description);
      alert.reasons.forEach((reason) => {
        expect(descriptions).toContain(reason);
      });
    });

    it("highestSeverity on the alert reflects the worst anomaly", async () => {
      const { processor, alertRepo } = makeProcessor();
      // superadmin grant is CRITICAL
      const event = makeEvent({
        actorId: "eve",
        targetUserId: "bob",
        previousPermission: "read",
        newPermission: "superadmin",
      });

      await processor.process(event);

      const alerts = alertRepo.query({ limit: 10 });
      expect(alerts[0]!.highestSeverity).toBe("CRITICAL");
    });

    it("processes multiple events independently", async () => {
      const { processor, eventRepo, alertRepo } = makeProcessor();

      await processor.process(
        makeEvent({ previousPermission: "read", newPermission: "write" }),
      );
      await processor.process(
        makeEvent({
          actorId: "mallory",
          targetUserId: "mallory",
          previousPermission: "none",
          newPermission: "superadmin",
        }),
      );

      expect(eventRepo.count()).toBe(2);
      expect(alertRepo.count()).toBe(1);
    });
  });
});
