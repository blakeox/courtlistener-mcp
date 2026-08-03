import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export type ResourceRefreshTtlResolver = (uri: string) => number | undefined;

/**
 * Manages resource subscriptions for MCP clients.
 * Tracks which resources each client session is subscribed to.
 */
export class SubscriptionManager {
  private subscriptions = new Map<string, Set<string>>();
  private refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private server: Server | null = null;
  private refreshTtlResolver: ResourceRefreshTtlResolver | null = null;

  bindServer(server: Server): void {
    this.server = server;
  }

  setRefreshTtlResolver(resolver: ResourceRefreshTtlResolver): void {
    this.refreshTtlResolver = resolver;
  }

  subscribe(uri: string, sessionId: string): void {
    let sessions = this.subscriptions.get(uri);
    if (!sessions) {
      sessions = new Set<string>();
      this.subscriptions.set(uri, sessions);
    }
    sessions.add(sessionId);
    this.scheduleRefresh(uri);
  }

  unsubscribe(uri: string, sessionId: string): void {
    const sessions = this.subscriptions.get(uri);
    if (sessions) {
      sessions.delete(sessionId);
      if (sessions.size === 0) {
        this.subscriptions.delete(uri);
        this.clearRefresh(uri);
      }
    }
  }

  getSubscribers(uri: string): Set<string> {
    return this.subscriptions.get(uri) ?? new Set<string>();
  }

  removeSession(sessionId: string): void {
    for (const [uri, sessions] of this.subscriptions) {
      sessions.delete(sessionId);
      if (sessions.size === 0) {
        this.subscriptions.delete(uri);
        this.clearRefresh(uri);
      }
    }
  }

  async notifyResourceUpdated(uri: string): Promise<void> {
    if (!this.server || this.getSubscribers(uri).size === 0) {
      return;
    }

    await this.server.sendResourceUpdated({ uri });
  }

  markResourceActivity(uri: string): void {
    if (this.getSubscribers(uri).size > 0) {
      this.scheduleRefresh(uri);
    }
  }

  destroy(): void {
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
    this.subscriptions.clear();
    this.server = null;
    this.refreshTtlResolver = null;
  }

  private scheduleRefresh(uri: string): void {
    const ttlMs = this.refreshTtlResolver?.(uri);
    if (!ttlMs || ttlMs <= 0 || this.getSubscribers(uri).size === 0) {
      return;
    }

    this.clearRefresh(uri);
    this.refreshTimers.set(
      uri,
      setTimeout(() => {
        void this.handleRefreshTimer(uri);
      }, ttlMs),
    );
  }

  private async handleRefreshTimer(uri: string): Promise<void> {
    this.refreshTimers.delete(uri);
    if (this.getSubscribers(uri).size === 0) {
      return;
    }

    await this.notifyResourceUpdated(uri);
    this.scheduleRefresh(uri);
  }

  private clearRefresh(uri: string): void {
    const timer = this.refreshTimers.get(uri);
    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(uri);
    }
  }
}
