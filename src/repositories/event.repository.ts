import type { PermissionChangeEvent } from '../models/event.model.js';

export interface IEventRepository {
  save(event: PermissionChangeEvent): void;
  findById(eventId: string): PermissionChangeEvent | undefined;
  findAll(): PermissionChangeEvent[];
  count(): number;
}

export class InMemoryEventRepository implements IEventRepository {
  private readonly store = new Map<string, PermissionChangeEvent>();

  save(event: PermissionChangeEvent): void {
    this.store.set(event.eventId, event);
  }

  findById(eventId: string): PermissionChangeEvent | undefined {
    return this.store.get(eventId);
  }

  findAll(): PermissionChangeEvent[] {
    return [...this.store.values()];
  }

  count(): number {
    return this.store.size;
  }
}
