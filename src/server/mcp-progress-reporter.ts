type ProgressToken = string | number;

export interface ProgressNotificationContext {
  _meta?: { progressToken?: ProgressToken };
  sendNotification?: (notification: {
    method: 'notifications/progress';
    params: {
      progressToken: ProgressToken;
      progress: number;
      total?: number;
      message?: string;
    };
  }) => Promise<void>;
}

export interface McpProgressReporter {
  readonly enabled: boolean;
  report(params: { progress: number; total?: number; message?: string }): Promise<void>;
}

export function createMcpProgressReporter(
  extra?: ProgressNotificationContext,
): McpProgressReporter {
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
          progressToken,
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
