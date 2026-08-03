import type { PromptHandlerRegistry } from './prompt-handler.js';
import { ProtocolListChangedNotifier } from './protocol-list-changed-notifier.js';
import type { ResourceHandlerRegistry } from './resource-handler.js';
import type { ToolHandlerRegistry } from './tool-handler.js';

export function wireCatalogListChangedNotifiers(options: {
  enabled: boolean;
  toolRegistry: ToolHandlerRegistry;
  resourceRegistry: ResourceHandlerRegistry;
  promptRegistry: PromptHandlerRegistry;
}): ProtocolListChangedNotifier {
  const notifier = new ProtocolListChangedNotifier(options.enabled);

  options.toolRegistry.setOnCatalogListChanged?.(() => {
    void notifier.notifyToolsListChanged();
  });
  options.resourceRegistry.setOnCatalogListChanged?.(() => {
    void notifier.notifyResourcesListChanged();
  });
  options.promptRegistry.setOnCatalogListChanged?.(() => {
    void notifier.notifyPromptsListChanged();
  });

  return notifier;
}
