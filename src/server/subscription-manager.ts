/**
 * Manages resource subscriptions for MCP clients.
 * Tracks which resources each client is subscribed to.
 */
export class SubscriptionManager {
  private subscriptions = new Map<string, Set<string>>(); // uri -> Set<sessionId>

  subscribe(uri: string, sessionId: string): void {
    let sessions = this.subscriptions.get(uri);
    if (!sessions) {
      sessions = new Set<string>();
      this.subscriptions.set(uri, sessions);
    }
    sessions.add(sessionId);
  }

  unsubscribe(uri: string, sessionId: string): void {
    const sessions = this.subscriptions.get(uri);
    if (sessions) {
      sessions.delete(sessionId);
      if (sessions.size === 0) {
        this.subscriptions.delete(uri);
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
      }
    }
  }
}
