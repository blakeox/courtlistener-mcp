import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export type CatalogListKind = 'tools' | 'resources' | 'prompts';

export class ProtocolListChangedNotifier {
  private server: Server | null = null;

  constructor(private readonly enabled: boolean) {}

  get isEnabled(): boolean {
    return this.enabled;
  }

  bindServer(server: Server): void {
    this.server = server;
  }

  destroy(): void {
    this.server = null;
  }

  async notifyToolsListChanged(): Promise<void> {
    if (!this.enabled || !this.server) {
      return;
    }

    await this.server.sendToolListChanged();
  }

  async notifyResourcesListChanged(): Promise<void> {
    if (!this.enabled || !this.server) {
      return;
    }

    await this.server.sendResourceListChanged();
  }

  async notifyPromptsListChanged(): Promise<void> {
    if (!this.enabled || !this.server) {
      return;
    }

    await this.server.sendPromptListChanged();
  }

  async notifyCatalogListChanged(kind: CatalogListKind): Promise<void> {
    switch (kind) {
      case 'tools':
        await this.notifyToolsListChanged();
        break;
      case 'resources':
        await this.notifyResourcesListChanged();
        break;
      case 'prompts':
        await this.notifyPromptsListChanged();
        break;
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
    }
  }

  async notifyAllListChanged(): Promise<void> {
    await Promise.all([
      this.notifyToolsListChanged(),
      this.notifyResourcesListChanged(),
      this.notifyPromptsListChanged(),
    ]);
  }
}
