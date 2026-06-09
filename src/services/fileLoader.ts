import { readFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import { CreateEventSchema } from '../models/event.model.js';
import logger from '../lib/logger.js';
import type { EventQueue } from './eventQueue.js';

const log = logger.child({ component: 'FileLoader' });

const BatchSchema = z.array(CreateEventSchema);

interface LoadResult {
  total: number;
  accepted: number;
  rejected: number;
  errors: { index: number; issues: { path: string; message: string }[] }[];
}

/**
 * Reads a JSON file containing an array of permission-change events and
 * enqueues each valid event into the processing queue.
 *
 * Invalid items are skipped and logged — a single bad record never blocks
 * the rest of the file from being processed.
 */
export function loadEventsFromFile(filePath: string, queue: EventQueue): LoadResult {
  const absPath = resolve(filePath);
  log.info({ absPath }, 'Reading events from file');

  const raw = readFileSync(absPath, 'utf-8');
  const json: unknown = JSON.parse(raw);

  // Attempt bulk validation first (fast path)
  const bulk = BatchSchema.safeParse(json);
  if (bulk.success) {
    bulk.data.forEach((e) => queue.enqueue(e));
    log.info({ count: bulk.data.length }, 'All events enqueued (bulk path)');
    return {
      total: bulk.data.length,
      accepted: bulk.data.length,
      rejected: 0,
      errors: [],
    };
  }

  // Slow path: validate row-by-row so bad records don't block good ones
  if (!Array.isArray(json)) {
    throw new Error(`Expected a JSON array in ${absPath}, got ${typeof json}`);
  }

  const result: LoadResult = {
    total: json.length, accepted: 0, rejected: 0, errors: [],
  };

  json.forEach((item: unknown, index: number) => {
    const parsed = CreateEventSchema.safeParse(item);
    if (parsed.success) {
      queue.enqueue(parsed.data);
      result.accepted += 1;
    } else {
      result.rejected += 1;
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      result.errors.push({ index, issues });
      log.warn({ index, issues }, 'Skipping invalid record');
    }
  });

  log.info(
    { accepted: result.accepted, rejected: result.rejected, total: result.total },
    'File loading complete',
  );
  return result;
}
