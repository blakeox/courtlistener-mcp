/**
 * In-memory EventStore for MCP Streamable HTTP resumability
 *
 * Allows clients to reconnect and resume receiving messages
 * from where they left off after a disconnection.
 */

import { randomUUID } from 'node:crypto';
import { EventStore, EventId, StreamId } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

interface StoredEvent {
  eventId: EventId;
  streamId: StreamId;
  message: JSONRPCMessage;
  timestamp: number;
}

export class InMemoryEventStore implements EventStore {
  private events: StoredEvent[] = [];
  private readonly maxEvents: number;
  private readonly ttlMs: number;

  constructor(options?: { maxEvents?: number; ttlMs?: number }) {
    this.maxEvents = options?.maxEvents ?? 10_000;
    this.ttlMs = options?.ttlMs ?? 30 * 60 * 1000; // 30 minutes default
  }

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    this.evict();

    const eventId = randomUUID();
    this.events.push({ eventId, streamId, message, timestamp: Date.now() });

    // Cap at max size
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    return eventId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
  ): Promise<StreamId> {
    const idx = this.events.findIndex((e) => e.eventId === lastEventId);
    if (idx === -1) {
      throw new Error(`Event ID ${lastEventId} not found in store`);
    }

    const streamId = this.events[idx].streamId;
    const eventsToReplay = this.events.slice(idx + 1).filter((e) => e.streamId === streamId);

    for (const event of eventsToReplay) {
      await send(event.eventId, event.message);
    }

    return streamId;
  }

  private evict(): void {
    const cutoff = Date.now() - this.ttlMs;
    this.events = this.events.filter((e) => e.timestamp > cutoff);
  }
}
