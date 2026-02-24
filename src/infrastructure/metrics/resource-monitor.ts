/**
 * Resource Monitor
 */

import { Logger } from '../logger.js';
import { ResourceOptions, ResourceUsage } from './types.js';

export class ResourceMonitor {
  private logger: Logger;
  private options: ResourceOptions;
  private startTime: number;
  private lastUsage?: ResourceUsage;

  constructor(logger: Logger, options: ResourceOptions = {}) {
    this.logger = logger.child('ResourceMonitor');
    this.options = {
      disabled: options.disabled || false,
      sampleInterval: options.sampleInterval || 5000,
    };
    this.startTime = Date.now();
  }

  async getResourceUsage(): Promise<ResourceUsage> {
    if (this.options.disabled) {
      return {
        timestamp: new Date().toISOString(),
        memory: { used: 0, total: 0, usagePercent: 0 },
        cpu: { usagePercent: 0 },
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      };
    }

    try {
      const memoryUsage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const freeMemory = require('os').freemem();
      const _usedMemory = totalMemory - freeMemory;

      // Simple CPU usage estimation (this is basic - for production use a proper CPU monitoring library)
      const _cpuUsage = process.cpuUsage();
      const cpuPercent = 0; // Placeholder - would need historical data for accurate calculation

      this.lastUsage = {
        timestamp: new Date().toISOString(),
        memory: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          usagePercent: memoryUsage.heapUsed / memoryUsage.heapTotal,
        },
        cpu: {
          usagePercent: cpuPercent,
        },
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      };

      return this.lastUsage;
    } catch (error) {
      this.logger.error('Failed to get resource usage', error as Error);
      throw error;
    }
  }

  getLastUsage(): ResourceUsage | undefined {
    return this.lastUsage;
  }

  getStartTime(): number {
    return this.startTime;
  }
}
