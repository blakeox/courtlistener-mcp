import { join } from 'node:path';

export interface LocalMcpServerRuntime {
  command: string;
  args: string[];
  label: string;
}

export function getLocalMcpServerRuntime(projectRoot: string): LocalMcpServerRuntime {
  return {
    command: process.execPath,
    args: ['--import', 'tsx', join(projectRoot, 'src/index.ts')],
    label: 'src/index.ts via tsx',
  };
}
