/**
 * Response compression middleware for Legal MCP Server
 * Provides gzip compression for large JSON responses
 */

import { Logger } from '../infrastructure/logger.js';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

export interface CompressionConfig {
  enabled: boolean;
  threshold: number; // Minimum bytes to compress
  level: number; // Compression level 1-9
  types: string[]; // MIME types to compress
}

export interface CompressionResult {
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  ratio: number;
  data: Buffer | string;
  encoding?: string;
}

export class CompressionMiddleware {
  private logger: Logger;

  constructor(
    private config: CompressionConfig,
    logger: Logger
  ) {
    this.logger = logger.child('Compression');
    
    if (this.config.enabled) {
      this.logger.info('Response compression enabled', {
        threshold: this.config.threshold,
        level: this.config.level,
        types: this.config.types
      });
    }
  }

  /**
   * Compress response data if applicable
   */
  async compressResponse(
    data: any, 
    contentType: string = 'application/json',
    acceptEncoding: string = ''
  ): Promise<CompressionResult> {
    if (!this.config.enabled) {
      const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
      return {
        compressed: false,
        originalSize: Buffer.byteLength(jsonData),
        compressedSize: Buffer.byteLength(jsonData),
        ratio: 1,
        data: jsonData
      };
    }

    const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
    const originalSize = Buffer.byteLength(jsonData);

    // Check if compression is worthwhile
    if (!this.shouldCompress(originalSize, contentType, acceptEncoding)) {
      return {
        compressed: false,
        originalSize,
        compressedSize: originalSize,
        ratio: 1,
        data: jsonData
      };
    }

    try {
      const timer = this.logger.startTimer('compression');
      const compressed = await gzipAsync(jsonData, { level: this.config.level });
      const duration = timer.end();

      const compressedSize = compressed.length;
      const ratio = originalSize / compressedSize;

      this.logger.debug('Response compressed', {
        originalSize,
        compressedSize,
        ratio: Math.round(ratio * 100) / 100,
        duration,
        savings: `${Math.round((1 - compressedSize / originalSize) * 100)}%`
      });

      return {
        compressed: true,
        originalSize,
        compressedSize,
        ratio,
        data: compressed,
        encoding: 'gzip'
      };

    } catch (error) {
      this.logger.warn('Compression failed, returning uncompressed', {
        error: error instanceof Error ? error.message : String(error),
        originalSize
      });

      return {
        compressed: false,
        originalSize,
        compressedSize: originalSize,
        ratio: 1,
        data: jsonData
      };
    }
  }

  /**
   * Decompress request data if needed
   */
  async decompressRequest(data: Buffer, encoding?: string): Promise<string> {
    if (!encoding || encoding !== 'gzip') {
      return data.toString();
    }

    try {
      const timer = this.logger.startTimer('decompression');
      const decompressed = await gunzipAsync(data);
      const duration = timer.end();

      this.logger.debug('Request decompressed', {
        compressedSize: data.length,
        decompressedSize: decompressed.length,
        duration
      });

      return decompressed.toString();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Decompression failed', undefined, { 
        error: errorMessage,
        dataSize: data.length
      });
      throw new Error('Failed to decompress request data');
    }
  }

  /**
   * Check if response should be compressed
   */
  private shouldCompress(
    size: number, 
    contentType: string, 
    acceptEncoding: string
  ): boolean {
    // Check size threshold
    if (size < this.config.threshold) {
      return false;
    }

    // Check if client accepts gzip
    if (!acceptEncoding.includes('gzip')) {
      return false;
    }

    // Check content type
    if (!this.config.types.some(type => contentType.includes(type))) {
      return false;
    }

    return true;
  }

  /**
   * Get compression statistics
   */
  getStats(): {
    enabled: boolean;
    threshold: number;
    level: number;
    supportedTypes: string[];
  } {
    return {
      enabled: this.config.enabled,
      threshold: this.config.threshold,
      level: this.config.level,
      supportedTypes: this.config.types
    };
  }
}

/**
 * Create compression middleware from environment configuration
 */
export function createCompressionMiddleware(logger: Logger): CompressionMiddleware {
  const config: CompressionConfig = {
    enabled: process.env.COMPRESSION_ENABLED === 'true',
    threshold: parseInt(process.env.COMPRESSION_THRESHOLD || '1024'),
    level: parseInt(process.env.COMPRESSION_LEVEL || '6'),
    types: process.env.COMPRESSION_TYPES ? 
           process.env.COMPRESSION_TYPES.split(',').map(t => t.trim()) :
           ['application/json', 'text/plain', 'text/html', 'application/javascript']
  };

  return new CompressionMiddleware(config, logger);
}
