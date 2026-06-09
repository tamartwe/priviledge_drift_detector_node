import { z, ZodError } from 'zod';
import type { Request, Response } from 'express';
import { CreateEventSchema } from '../models/event.model.js';
import type { EventQueue } from '../services/eventQueue.js';

const BatchSchema = z.array(CreateEventSchema).min(1).max(1000);

/**
 * HTTP-only controller: validates inbound event payloads and enqueues them.
 * All post-dequeue processing (detection, persistence, alert assembly) lives
 * in EventProcessorService, which is registered separately as the queue
 * processor callback.
 */
export class EventController {
  constructor(private readonly queue: EventQueue) {}

  /** POST /events */
  submit = (req: Request, res: Response): void => {
    const parsed = CreateEventSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        issues: formatZodError(parsed.error),
      });
      return;
    }

    const event = parsed.data;
    this.queue.enqueue(event);

    res.status(202).json({
      accepted: true,
      eventId: event.eventId,
      queueSize: this.queue.size,
    });
  };

  /** POST /events/batch — accepts an array of events, validates each independently */
  submitBatch = (req: Request, res: Response): void => {
    const parsed = BatchSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        issues: formatZodError(parsed.error),
      });
      return;
    }

    const events = parsed.data;
    events.forEach((e) => this.queue.enqueue(e));

    res.status(202).json({
      accepted: true,
      count: events.length,
      queueSize: this.queue.size,
    });
  };
}

function formatZodError(err: ZodError): { path: string; message: string }[] {
  return err.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
