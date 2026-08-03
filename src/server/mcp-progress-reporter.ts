import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ProgressToken,
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';

export interface McpProgressReporter {
  readonly enabled: boolean;
  report(params: { progress: number; total?: number; message?: string }): Promise<void>;
}

type ProgressExtra = Pick<
  RequestHandlerExtra<ServerRequest, ServerNotification>,
  'sendNotification' | '_meta'
>;

export function createMcpProgressReporter(extra?: ProgressExtra): McpProgressReporter {
  const progressToken = extra?._meta?.progressToken;

  return {
    enabled: progressToken !== undefined,
    report: async ({ progress, total, message }) => {
      if (progressToken === undefined || !extra?.sendNotification) {
        return;
      }

      await extra.sendNotification({
        method: 'notifications/progress',
        params: {
          progressToken: progressToken as ProgressToken,
          progress,
          ...(total !== undefined ? { total } : {}),
          ...(message ? { message } : {}),
        },
      });
    },
  };
}

export async function reportMcpProgressPhases(
  reporter: McpProgressReporter | undefined,
  phases: Array<{ progress: number; total?: number; message: string }>,
): Promise<void> {
  if (!reporter?.enabled) {
    return;
  }

  for (const phase of phases) {
    await reporter.report(phase);
  }
}
