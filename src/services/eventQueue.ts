import type { PermissionChangeEvent } from '../models/event.model.js';
import logger from '../lib/logger.js';

type ProcessorFn = (event: PermissionChangeEvent) => Promise<void>;

const log = logger.child({ component: 'EventQueue' });

/**
 * Non-blocking async FIFO queue.
 *
 * Events are enqueued synchronously and processed in order by the registered
 * processor function. The drain loop yields between items via `setImmediate`
 * so the HTTP server stays responsive under burst ingestion.
 */
export class EventQueue {
  private readonly queue: PermissionChangeEvent[] = [];

  private processor: ProcessorFn | null = null;

  private draining = false;

  enqueued = 0;

  processed = 0;

  register(fn: ProcessorFn): void {
    this.processor = fn;
  }

  enqueue(event: PermissionChangeEvent): void {
    this.queue.push(event);
    this.enqueued += 1;
    if (!this.draining) void this.drain();
  }

  get size(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    if (this.draining || this.processor === null) return;
    this.draining = true;

    while (this.queue.length > 0) {
      const event = this.queue.shift();
      if (event === undefined) break;

      try {
        // eslint-disable-next-line no-await-in-loop
        await this.processor(event);
        this.processed += 1;
      } catch (err) {
        log.error({ eventId: event.eventId, err }, 'Failed to process event');
      }

      // eslint-disable-next-line no-await-in-loop
      await yieldToEventLoop();
    }

    this.draining = false;
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => { setImmediate(resolve); });
}
