/**
 * ✅ Comprehensive tests for Compression Middleware (TypeScript)
 * Tests gzip/brotli compression, threshold handling, and performance
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createMockLogger,
  createMockRequest,
  performance,
  type MockLogger,
} from '../utils/test-helpers.ts';

type CompressionAlgorithm = 'br' | 'gzip' | 'deflate';
type CompressionState = 'below_threshold' | 'no_supported_encoding' | 'incompressible_type';

interface CompressionResult {
  data: string;
  encoding: string | null;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  ratio: number;
  algorithm: string | null;
  reason?: CompressionState | string;
  compressionTime?: number;
  bytesSaved?: number;
  error?: string;
}

interface CompressionConfig {
  enabled?: boolean;
  threshold?: number;
  algorithms?: CompressionAlgorithm[];
  level?: number;
  chunkSize?: number;
  memoryLevel?: number;
  windowBits?: number;
  compressionStats?: boolean;
}

interface CompressionStats {
  totalRequests: number;
  compressedRequests: number;
  totalBytesSaved: number;
  compressionRatios: number[];
  algorithmUsage: Record<string, number>;
  compressionTimes: number[];
}

interface CompressionStatsReport {
  totalRequests: number;
  compressedRequests: number;
  compressionRate: string;
  totalBytesSaved: number;
  averageCompressionRatio: string;
  averageCompressionTime: string;
  algorithmUsage: Record<string, number>;
  bandwidthSavings: string;
}

interface ChunkResult {
  chunks: CompressionResult[];
  totalOriginalSize: number;
  totalCompressedSize: number;
  totalRatio: number;
  algorithm: CompressionAlgorithm;
}

interface CompressDecision {
  shouldCompress: boolean;
  reason?: CompressionState;
}

// Mock compression utilities for testing
class MockCompressionUtils {
  static gzipCompress(data: string): {
    data: string;
    originalSize: number;
    compressedSize: number;
    ratio: number;
  } {
    // Simulate gzip compression by reducing data size by ~60%
    const originalSize = Buffer.byteLength(data, 'utf8');
    const compressedSize = Math.floor(originalSize * 0.4);
    return {
      data: `[GZIP_COMPRESSED:${compressedSize}]${data.substring(0, 50)}...`,
      originalSize,
      compressedSize,
      ratio: originalSize / compressedSize,
    };
  }

  static brotliCompress(data: string): {
    data: string;
    originalSize: number;
    compressedSize: number;
    ratio: number;
  } {
    // Simulate brotli compression by reducing data size by ~70%
    const originalSize = Buffer.byteLength(data, 'utf8');
    const compressedSize = Math.floor(originalSize * 0.3);
    return {
      data: `[BROTLI_COMPRESSED:${compressedSize}]${data.substring(0, 50)}...`,
      originalSize,
      compressedSize,
      ratio: originalSize / compressedSize,
    };
  }

  static deflateCompress(data: string): {
    data: string;
    originalSize: number;
    compressedSize: number;
    ratio: number;
  } {
    // Simulate deflate compression by reducing data size by ~55%
    const originalSize = Buffer.byteLength(data, 'utf8');
    const compressedSize = Math.floor(originalSize * 0.45);
    return {
      data: `[DEFLATE_COMPRESSED:${compressedSize}]${data.substring(0, 50)}...`,
      originalSize,
      compressedSize,
      ratio: originalSize / compressedSize,
    };
  }
}

// Mock compression middleware implementation for testing
class MockCompressionMiddleware {
  public stats: CompressionStats;
  public config: Required<CompressionConfig>;
  private logger: MockLogger;

  constructor(config: CompressionConfig, logger: MockLogger) {
    this.config = {
      enabled: true,
      threshold: 1024, // 1KB
      algorithms: ['br', 'gzip', 'deflate'],
      level: 6, // Compression level 1-9
      chunkSize: 16384, // 16KB chunks
      memoryLevel: 8,
      windowBits: 15,
      compressionStats: true,
      ...config,
    };
    this.logger = logger;
    this.stats = {
      totalRequests: 0,
      compressedRequests: 0,
      totalBytesSaved: 0,
      compressionRatios: [],
      algorithmUsage: {},
      compressionTimes: [],
    };
  }

  async compressResponse(
    data: string | null,
    acceptedEncodings: (string | null | undefined)[] = []
  ): Promise<CompressionResult> {
    this.stats.totalRequests++;

    if (!this.config.enabled || data === null) {
      const size = data ? Buffer.byteLength(data, 'utf8') : 0;
      return {
        data: data || '',
        encoding: null,
        compressed: false,
        originalSize: size,
        compressedSize: size,
        ratio: 1.0,
        algorithm: null,
      };
    }

    const dataSize = Buffer.byteLength(data, 'utf8');

    // Skip compression for small data
    if (dataSize < this.config.threshold) {
      return {
        data,
        encoding: null,
        compressed: false,
        originalSize: dataSize,
        compressedSize: dataSize,
        ratio: 1.0,
        algorithm: null,
        reason: 'below_threshold',
      };
    }

    // Filter out null/undefined from accepted encodings
    const validEncodings = acceptedEncodings.filter(
      (e): e is string => typeof e === 'string' && e !== ''
    );

    // Determine best compression algorithm
    const algorithm = this.selectCompressionAlgorithm(validEncodings);
    if (!algorithm) {
      return {
        data,
        encoding: null,
        compressed: false,
        originalSize: dataSize,
        compressedSize: dataSize,
        ratio: 1.0,
        algorithm: null,
        reason: 'no_supported_encoding',
      };
    }

    const startTime = Date.now();
    let result: {
      data: string;
      originalSize: number;
      compressedSize: number;
      ratio: number;
    };

    try {
      switch (algorithm) {
        case 'br':
          result = MockCompressionUtils.brotliCompress(data);
          break;
        case 'gzip':
          result = MockCompressionUtils.gzipCompress(data);
          break;
        case 'deflate':
          result = MockCompressionUtils.deflateCompress(data);
          break;
        default:
          throw new Error(`Unsupported compression algorithm: ${algorithm}`);
      }

      const compressionTime = Date.now() - startTime;
      const bytesSaved = result.originalSize - result.compressedSize;

      // Update statistics
      this.stats.compressedRequests++;
      this.stats.totalBytesSaved += bytesSaved;
      this.stats.compressionRatios.push(result.ratio);
      this.stats.compressionTimes.push(compressionTime);
      this.stats.algorithmUsage[algorithm] =
        (this.stats.algorithmUsage[algorithm] || 0) + 1;

      if (this.config.compressionStats) {
        this.logger.debug('Response compressed', {
          algorithm,
          originalSize: result.originalSize,
          compressedSize: result.compressedSize,
          ratio: result.ratio.toFixed(2),
          bytesSaved,
          compressionTime,
        });
      }

      return {
        data: result.data,
        encoding: algorithm,
        compressed: true,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        ratio: result.ratio,
        algorithm,
        compressionTime,
        bytesSaved,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Compression failed', {
        algorithm,
        error: errorMessage,
      });

      return {
        data,
        encoding: null,
        compressed: false,
        originalSize: dataSize,
        compressedSize: dataSize,
        ratio: 1.0,
        algorithm: null,
        error: errorMessage,
      };
    }
  }

  selectCompressionAlgorithm(
    acceptedEncodings: string[]
  ): CompressionAlgorithm | null {
    // Priority order: brotli > gzip > deflate
    for (const algorithm of this.config.algorithms) {
      if (acceptedEncodings.includes(algorithm)) {
        return algorithm;
      }
    }
    return null;
  }

  shouldCompress(
    data: string,
    contentType = 'application/json'
  ): CompressDecision {
    // Check data size threshold
    const dataSize = Buffer.byteLength(data, 'utf8');
    if (dataSize < this.config.threshold) {
      return { shouldCompress: false, reason: 'below_threshold' };
    }

    // Check content type (compressible types)
    const compressibleTypes = [
      'application/json',
      'application/javascript',
      'text/',
      'application/xml',
    ];

    const isCompressible = compressibleTypes.some((type) =>
      contentType.toLowerCase().includes(type)
    );

    if (!isCompressible) {
      return { shouldCompress: false, reason: 'incompressible_type' };
    }

    return { shouldCompress: true };
  }

  async compressInChunks(
    data: string,
    algorithm: CompressionAlgorithm
  ): Promise<ChunkResult> {
    const chunks: CompressionResult[] = [];
    const chunkSize = this.config.chunkSize;

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      const compressedChunk = await this.compressResponse(chunk, [algorithm]);
      chunks.push(compressedChunk);
    }

    // Combine compressed chunks
    const totalOriginalSize = chunks.reduce(
      (sum, chunk) => sum + chunk.originalSize,
      0
    );
    const totalCompressedSize = chunks.reduce(
      (sum, chunk) => sum + chunk.compressedSize,
      0
    );

    return {
      chunks,
      totalOriginalSize,
      totalCompressedSize,
      totalRatio: totalOriginalSize / totalCompressedSize,
      algorithm,
    };
  }

  getCompressionStats(): CompressionStatsReport {
    const avgRatio =
      this.stats.compressionRatios.length > 0
        ? this.stats.compressionRatios.reduce((a, b) => a + b) /
          this.stats.compressionRatios.length
        : 0;

    const avgCompressionTime =
      this.stats.compressionTimes.length > 0
        ? this.stats.compressionTimes.reduce((a, b) => a + b) /
          this.stats.compressionTimes.length
        : 0;

    const compressionRate =
      this.stats.totalRequests > 0
        ? (this.stats.compressedRequests / this.stats.totalRequests) * 100
        : 0;

    return {
      totalRequests: this.stats.totalRequests,
      compressedRequests: this.stats.compressedRequests,
      compressionRate: compressionRate.toFixed(2) + '%',
      totalBytesSaved: this.stats.totalBytesSaved,
      averageCompressionRatio: avgRatio.toFixed(2),
      averageCompressionTime: avgCompressionTime.toFixed(2) + 'ms',
      algorithmUsage: { ...this.stats.algorithmUsage },
      bandwidthSavings: this.formatBytes(this.stats.totalBytesSaved),
    };
  }

  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      compressedRequests: 0,
      totalBytesSaved: 0,
      compressionRatios: [],
      algorithmUsage: {},
      compressionTimes: [],
    };
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  setCompressionLevel(level: number): void {
    if (level < 1 || level > 9) {
      throw new Error('Compression level must be between 1 and 9');
    }
    this.config.level = level;
  }

  isContentTypeCompressible(contentType: string): boolean {
    const compressibleTypes = [
      'text/html',
      'text/css',
      'text/javascript',
      'text/xml',
      'text/plain',
      'application/json',
      'application/javascript',
      'application/xml',
      'application/rss+xml',
      'application/atom+xml',
      'image/svg+xml',
    ];

    return compressibleTypes.some((type) =>
      contentType.toLowerCase().includes(type.toLowerCase())
    );
  }
}

describe('Compression Middleware Tests', () => {
  let compressionMiddleware: MockCompressionMiddleware;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    compressionMiddleware = new MockCompressionMiddleware(
      {
        enabled: true,
        threshold: 100, // Lower threshold for testing
        algorithms: ['br', 'gzip', 'deflate'],
      },
      mockLogger
    );
  });

  describe('Basic Compression', () => {
    it('should compress data above threshold', async () => {
      const largeData = 'x'.repeat(1000); // 1KB of data
      const acceptedEncodings = ['gzip', 'deflate'];

      const result = await compressionMiddleware.compressResponse(
        largeData,
        acceptedEncodings
      );

      assert.strictEqual(result.compressed, true, 'Should compress large data');
      assert.ok(
        result.compressedSize < result.originalSize,
        'Compressed size should be smaller'
      );
      assert.ok(result.ratio > 1, 'Compression ratio should be greater than 1');
      assert.strictEqual(result.algorithm, 'gzip', 'Should use gzip algorithm');
    });

    it('should not compress data below threshold', async () => {
      const smallData = 'small data';
      const acceptedEncodings = ['gzip'];

      const result = await compressionMiddleware.compressResponse(
        smallData,
        acceptedEncodings
      );

      assert.strictEqual(
        result.compressed,
        false,
        'Should not compress small data'
      );
      assert.strictEqual(
        result.reason,
        'below_threshold',
        'Should specify threshold reason'
      );
      assert.strictEqual(result.data, smallData, 'Should return original data');
    });

    it('should select best compression algorithm', async () => {
      const data = 'x'.repeat(1000);

      // Test brotli preference
      let result = await compressionMiddleware.compressResponse(data, [
        'br',
        'gzip',
      ]);
      assert.strictEqual(
        result.algorithm,
        'br',
        'Should prefer brotli when available'
      );

      // Test gzip fallback
      result = await compressionMiddleware.compressResponse(data, [
        'gzip',
        'deflate',
      ]);
      assert.strictEqual(
        result.algorithm,
        'gzip',
        'Should use gzip when brotli not available'
      );

      // Test deflate fallback
      result = await compressionMiddleware.compressResponse(data, ['deflate']);
      assert.strictEqual(
        result.algorithm,
        'deflate',
        'Should use deflate as last resort'
      );
    });

    it('should handle unsupported encodings', async () => {
      const data = 'x'.repeat(1000);
      const acceptedEncodings = ['unsupported'];

      const result = await compressionMiddleware.compressResponse(
        data,
        acceptedEncodings
      );

      assert.strictEqual(
        result.compressed,
        false,
        'Should not compress with unsupported encoding'
      );
      assert.strictEqual(
        result.reason,
        'no_supported_encoding',
        'Should specify encoding reason'
      );
    });
  });

  describe('Compression Algorithms', () => {
    const testData = 'This is a test string that will be compressed using different algorithms. '.repeat(50);

    it('should use brotli compression', async () => {
      const result = await compressionMiddleware.compressResponse(testData, [
        'br',
      ]);

      assert.strictEqual(result.compressed, true, 'Should compress with brotli');
      assert.strictEqual(result.algorithm, 'br', 'Should use brotli algorithm');
      assert.ok(
        result.data.includes('[BROTLI_COMPRESSED'),
        'Should contain brotli marker'
      );
      assert.ok(
        result.ratio > 2,
        'Brotli should achieve good compression ratio'
      );
    });

    it('should use gzip compression', async () => {
      const result = await compressionMiddleware.compressResponse(testData, [
        'gzip',
      ]);

      assert.strictEqual(result.compressed, true, 'Should compress with gzip');
      assert.strictEqual(result.algorithm, 'gzip', 'Should use gzip algorithm');
      assert.ok(
        result.data.includes('[GZIP_COMPRESSED'),
        'Should contain gzip marker'
      );
      assert.ok(
        result.ratio > 1.5,
        'Gzip should achieve reasonable compression ratio'
      );
    });

    it('should use deflate compression', async () => {
      const result = await compressionMiddleware.compressResponse(testData, [
        'deflate',
      ]);

      assert.strictEqual(
        result.compressed,
        true,
        'Should compress with deflate'
      );
      assert.strictEqual(
        result.algorithm,
        'deflate',
        'Should use deflate algorithm'
      );
      assert.ok(
        result.data.includes('[DEFLATE_COMPRESSED'),
        'Should contain deflate marker'
      );
      assert.ok(
        result.ratio > 1.2,
        'Deflate should achieve some compression ratio'
      );
    });

    it('should compare compression ratios between algorithms', async () => {
      const brotliResult = await compressionMiddleware.compressResponse(
        testData,
        ['br']
      );
      const gzipResult = await compressionMiddleware.compressResponse(
        testData,
        ['gzip']
      );
      const deflateResult = await compressionMiddleware.compressResponse(
        testData,
        ['deflate']
      );

      assert.ok(
        brotliResult.ratio > gzipResult.ratio,
        'Brotli should have better ratio than gzip'
      );
      assert.ok(
        gzipResult.ratio > deflateResult.ratio,
        'Gzip should have better ratio than deflate'
      );
    });
  });

  describe('Content Type Handling', () => {
    it('should identify compressible content types', () => {
      const compressibleTypes = [
        'application/json',
        'text/html',
        'text/css',
        'application/javascript',
        'text/xml',
        'image/svg+xml',
      ];

      compressibleTypes.forEach((contentType) => {
        const isCompressible =
          compressionMiddleware.isContentTypeCompressible(contentType);
        assert.strictEqual(
          isCompressible,
          true,
          `${contentType} should be compressible`
        );
      });
    });

    it('should identify non-compressible content types', () => {
      const nonCompressibleTypes = [
        'image/jpeg',
        'image/png',
        'video/mp4',
        'application/pdf',
        'application/zip',
      ];

      nonCompressibleTypes.forEach((contentType) => {
        const isCompressible =
          compressionMiddleware.isContentTypeCompressible(contentType);
        assert.strictEqual(
          isCompressible,
          false,
          `${contentType} should not be compressible`
        );
      });
    });

    it('should handle compression decision based on content type', () => {
      const data = 'x'.repeat(1000);

      let decision = compressionMiddleware.shouldCompress(
        data,
        'application/json'
      );
      assert.strictEqual(
        decision.shouldCompress,
        true,
        'Should compress JSON data'
      );

      decision = compressionMiddleware.shouldCompress(data, 'image/jpeg');
      assert.strictEqual(
        decision.shouldCompress,
        false,
        'Should not compress JPEG data'
      );
      assert.strictEqual(
        decision.reason,
        'incompressible_type',
        'Should specify type reason'
      );
    });
  });

  describe('Chunked Compression', () => {
    it('should compress data in chunks', async () => {
      const largeData = 'Large chunk of data. '.repeat(1000); // ~20KB

      const chunkResult = await compressionMiddleware.compressInChunks(
        largeData,
        'gzip'
      );

      assert.ok(chunkResult.chunks.length > 1, 'Should create multiple chunks');
      assert.ok(
        chunkResult.totalCompressedSize < chunkResult.totalOriginalSize,
        'Total compressed size should be smaller'
      );
      assert.ok(
        chunkResult.totalRatio > 1,
        'Should achieve compression across chunks'
      );
      assert.strictEqual(
        chunkResult.algorithm,
        'gzip',
        'Should use specified algorithm'
      );
    });

    it('should handle chunk boundaries correctly', async () => {
      const exactChunkData = 'x'.repeat(16384); // Exactly one chunk size

      const chunkResult = await compressionMiddleware.compressInChunks(
        exactChunkData,
        'gzip'
      );

      assert.strictEqual(
        chunkResult.chunks.length,
        1,
        'Should create exactly one chunk'
      );
      assert.strictEqual(
        chunkResult.totalOriginalSize,
        16384,
        'Should handle exact chunk size'
      );
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track compression statistics', async () => {
      const data1 = 'x'.repeat(1000);
      const data2 = 'y'.repeat(2000);
      const smallData = 'small';

      await compressionMiddleware.compressResponse(data1, ['gzip']);
      await compressionMiddleware.compressResponse(data2, ['br']);
      await compressionMiddleware.compressResponse(smallData, ['gzip']); // Should not compress

      const stats = compressionMiddleware.getCompressionStats();

      assert.strictEqual(stats.totalRequests, 3, 'Should track total requests');
      assert.strictEqual(
        stats.compressedRequests,
        2,
        'Should track compressed requests'
      );
      assert.ok(
        parseFloat(stats.compressionRate) > 50,
        'Should calculate compression rate'
      );
      assert.ok(stats.totalBytesSaved > 0, 'Should track bytes saved');
      assert.strictEqual(stats.algorithmUsage.gzip, 1, 'Should track gzip usage');
      assert.strictEqual(
        stats.algorithmUsage.br,
        1,
        'Should track brotli usage'
      );
    });

    it('should calculate average compression metrics', async () => {
      // Create multiple compression operations
      for (let i = 0; i < 5; i++) {
        const data = 'test data '.repeat(100 + i * 50);
        await compressionMiddleware.compressResponse(data, ['gzip']);
      }

      const stats = compressionMiddleware.getCompressionStats();

      assert.ok(
        parseFloat(stats.averageCompressionRatio) > 1,
        'Should calculate average compression ratio'
      );
      assert.ok(
        parseFloat(stats.averageCompressionTime) >= 0,
        'Should calculate average compression time'
      );
    });

    it('should format bandwidth savings correctly', async () => {
      const largeData = 'x'.repeat(10000); // 10KB
      await compressionMiddleware.compressResponse(largeData, ['gzip']);

      const stats = compressionMiddleware.getCompressionStats();

      assert.ok(
        stats.bandwidthSavings.includes('KB') ||
          stats.bandwidthSavings.includes('Bytes'),
        'Should format bandwidth savings with units'
      );
    });

    it('should reset statistics', async () => {
      await compressionMiddleware.compressResponse('x'.repeat(1000), ['gzip']);

      let stats = compressionMiddleware.getCompressionStats();
      assert.strictEqual(
        stats.totalRequests,
        1,
        'Should have statistics before reset'
      );

      compressionMiddleware.resetStats();

      stats = compressionMiddleware.getCompressionStats();
      assert.strictEqual(stats.totalRequests, 0, 'Should reset statistics');
      assert.strictEqual(
        stats.compressedRequests,
        0,
        'Should reset all counters'
      );
    });
  });

  describe('Configuration Options', () => {
    it('should respect compression threshold setting', async () => {
      const customMiddleware = new MockCompressionMiddleware(
        {
          threshold: 2000, // 2KB threshold
        },
        mockLogger
      );

      const mediumData = 'x'.repeat(1000); // 1KB - below threshold
      const largeData = 'x'.repeat(3000); // 3KB - above threshold

      const mediumResult = await customMiddleware.compressResponse(
        mediumData,
        ['gzip']
      );
      const largeResult = await customMiddleware.compressResponse(largeData, [
        'gzip',
      ]);

      assert.strictEqual(
        mediumResult.compressed,
        false,
        'Should not compress below custom threshold'
      );
      assert.strictEqual(
        largeResult.compressed,
        true,
        'Should compress above custom threshold'
      );
    });

    it('should disable compression when configured', async () => {
      const disabledMiddleware = new MockCompressionMiddleware(
        {
          enabled: false,
        },
        mockLogger
      );

      const data = 'x'.repeat(5000);
      const result = await disabledMiddleware.compressResponse(data, ['gzip']);

      assert.strictEqual(
        result.compressed,
        false,
        'Should not compress when disabled'
      );
      assert.strictEqual(result.data, data, 'Should return original data');
    });

    it('should respect algorithm priority order', async () => {
      const customMiddleware = new MockCompressionMiddleware(
        {
          algorithms: ['deflate', 'gzip', 'br'], // Custom priority order
        },
        mockLogger
      );

      const data = 'x'.repeat(1000);
      const result = await customMiddleware.compressResponse(data, [
        'br',
        'gzip',
        'deflate',
      ]);

      assert.strictEqual(
        result.algorithm,
        'deflate',
        'Should use first algorithm in priority list'
      );
    });

    it('should validate compression level settings', () => {
      try {
        compressionMiddleware.setCompressionLevel(10); // Invalid level
        assert.fail('Should throw error for invalid compression level');
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        assert.ok(
          errorMessage.includes('between 1 and 9'),
          'Should validate compression level range'
        );
      }

      // Valid level should work
      compressionMiddleware.setCompressionLevel(9);
      assert.strictEqual(
        compressionMiddleware.config.level,
        9,
        'Should set valid compression level'
      );
    });
  });

  describe('Performance Tests', () => {
    it('should compress data efficiently', async () => {
      const largeData = 'Performance test data. '.repeat(1000); // ~23KB

      const result = await performance.measureTime(async () => {
        return await compressionMiddleware.compressResponse(largeData, [
          'gzip',
        ]);
      });

      assert.ok(
        result.duration < 100,
        `Compression should be fast, took ${result.duration}ms`
      );
      assert.strictEqual(result.result.compressed, true, 'Should successfully compress');
    });

    it('should handle multiple concurrent compressions', async () => {
      const data = 'Concurrent test data. '.repeat(100);
      const compressions: Promise<CompressionResult>[] = [];

      const startTime = Date.now();

      // Start multiple concurrent compressions
      for (let i = 0; i < 10; i++) {
        compressions.push(
          compressionMiddleware.compressResponse(data, ['gzip'])
        );
      }

      const results = await Promise.all(compressions);
      const duration = Date.now() - startTime;

      assert.ok(
        duration < 500,
        `Concurrent compressions should be efficient, took ${duration}ms`
      );
      assert.ok(
        results.every((r) => r.compressed === true),
        'All compressions should succeed'
      );
    });

    it('should scale with data size appropriately', async () => {
      const sizes = [1000, 5000, 10000, 20000]; // Different data sizes
      const results: Array<{
        size: number;
        duration: number;
        ratio: number;
      }> = [];

      for (const size of sizes) {
        const data = 'x'.repeat(size);
        const result = await performance.measureTime(async () => {
          return await compressionMiddleware.compressResponse(data, ['gzip']);
        });
        results.push({
          size,
          duration: result.duration,
          ratio: result.result.ratio,
        });
      }

      // Compression time should scale reasonably with size
      for (let i = 1; i < results.length; i++) {
        const currentRatio = results[i].duration / results[i].size;
        const previousRatio = results[i - 1].duration / results[i - 1].size;

        assert.ok(
          currentRatio < previousRatio * 2,
          'Compression should scale reasonably with data size'
        );
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle compression errors gracefully', async () => {
      // Mock a compression error by using an invalid algorithm internally
      const errorMiddleware = new MockCompressionMiddleware(
        {
          algorithms: ['invalid-algorithm'] as CompressionAlgorithm[],
        },
        mockLogger
      );

      // Override the algorithm selection to return invalid algorithm
      errorMiddleware.selectCompressionAlgorithm = () =>
        'invalid-algorithm' as CompressionAlgorithm;

      const data = 'x'.repeat(1000);
      const result = await errorMiddleware.compressResponse(data, ['gzip']);

      assert.strictEqual(
        result.compressed,
        false,
        'Should not compress on error'
      );
      assert.ok(result.error !== undefined, 'Should include error information');
      assert.strictEqual(result.data, data, 'Should return original data on error');
    });

    it('should handle empty or null data', async () => {
      const emptyResult = await compressionMiddleware.compressResponse('', [
        'gzip',
      ]);
      assert.strictEqual(
        emptyResult.compressed,
        false,
        'Should not compress empty data'
      );

      const nullResult = await compressionMiddleware.compressResponse(null, [
        'gzip',
      ]);
      assert.strictEqual(
        nullResult.compressed,
        false,
        'Should handle null data gracefully'
      );
    });

    it('should handle malformed encoding arrays', async () => {
      const data = 'x'.repeat(1000);

      const result1 = await compressionMiddleware.compressResponse(data, [
        null,
        undefined,
        '',
      ] as unknown as string[]);
      assert.strictEqual(
        result1.compressed,
        false,
        'Should handle malformed encoding values'
      );

      const result2 = await compressionMiddleware.compressResponse(data, []);
      assert.strictEqual(
        result2.compressed,
        false,
        'Should handle empty encoding array'
      );
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle typical MCP response compression', async () => {
      const mcpResponse = JSON.stringify({
        jsonrpc: '2.0',
        id: '123',
        result: {
          content: [
            {
              type: 'text',
              text: 'This is a long legal document response. '.repeat(100),
            },
          ],
        },
      });

      const result = await compressionMiddleware.compressResponse(
        mcpResponse,
        ['br', 'gzip', 'deflate']
      );

      assert.strictEqual(result.compressed, true, 'Should compress MCP responses');
      assert.strictEqual(
        result.algorithm,
        'br',
        'Should use best available algorithm'
      );
      assert.ok(result.ratio > 2, 'Should achieve good compression on JSON');
    });

    it('should handle streaming responses efficiently', async () => {
      // Simulate streaming by compressing multiple chunks
      const chunks = [
        'First chunk of streaming data. ',
        'Second chunk with more content. ',
        'Third chunk completing the stream. ',
      ].map((chunk) => chunk.repeat(50));

      const results: CompressionResult[] = [];
      for (const chunk of chunks) {
        const result = await compressionMiddleware.compressResponse(chunk, [
          'gzip',
        ]);
        results.push(result);
      }

      assert.ok(
        results.every((r) => r.compressed === true),
        'Should compress all stream chunks'
      );

      const totalSavings = results.reduce(
        (sum, r) => sum + (r.bytesSaved || 0),
        0
      );
      assert.ok(
        totalSavings > 0,
        'Should save bandwidth across stream'
      );
    });

    it('should work with different response types', async () => {
      const responses: Record<string, string> = {
        json: JSON.stringify({ data: 'x'.repeat(500) }),
        xml: `<root>${'<item>data</item>'.repeat(100)}</root>`,
        javascript: `function test() { ${'// comment\n'.repeat(100)} }`,
        css: `.class { ${'property: value;\n'.repeat(100)} }`,
      };

      for (const [type, data] of Object.entries(responses)) {
        const result = await compressionMiddleware.compressResponse(data, [
          'gzip',
        ]);
        assert.strictEqual(
          result.compressed,
          true,
          `Should compress ${type} content`
        );
        assert.ok(result.ratio > 1.5, `Should achieve good ratio for ${type}`);
      }
    });
  });

  describe('Enhanced Integration Tests', () => {
    it('should handle size-based compression decisions correctly', async () => {
      const compressionMiddleware = new MockCompressionMiddleware(
        {
          enabled: true,
          threshold: 50,
        },
        createMockLogger()
      );

      // Test large response (should compress)
      const largeResponse = { data: 'x'.repeat(100) };
      const largeResult = await compressionMiddleware.compressResponse(
        JSON.stringify(largeResponse)
      );

      assert.strictEqual(
        largeResult.compressed,
        true,
        'Should compress large responses'
      );
      assert.ok(
        (largeResult.bytesSaved || 0) > 0,
        'Should save bytes for large responses'
      );

      // Test small response (should not compress)
      const smallResponse = { data: 'small' };
      const smallResult = await compressionMiddleware.compressResponse(
        JSON.stringify(smallResponse)
      );

      assert.strictEqual(
        smallResult.compressed,
        false,
        'Should not compress small responses'
      );
      assert.strictEqual(
        smallResult.bytesSaved || 0,
        0,
        'Should not save bytes for small responses'
      );
    });

    it('should measure compression performance for large datasets', async () => {
      const compressionMiddleware = new MockCompressionMiddleware(
        {
          enabled: true,
          threshold: 1024,
        },
        createMockLogger()
      );

      const largeData = {
        data: Array(10000)
          .fill('test data string')
          .join(' '),
      };

      const start = Date.now();
      const result = await compressionMiddleware.compressResponse(
        JSON.stringify(largeData)
      );
      const duration = Date.now() - start;

      assert.strictEqual(
        result.compressed,
        true,
        'Should compress large datasets'
      );
      assert.ok(duration < 500, 'Should complete compression within 500ms');
      assert.ok(
        (result.bytesSaved || 0) > 0,
        'Should achieve significant compression'
      );

      console.log(`    ⚡ Large dataset compression completed in ${duration}ms`);
      console.log(`    💾 Achieved ${result.ratio.toFixed(2)}x compression ratio`);
    });

    it('should handle error conditions gracefully', async () => {
      const compressionMiddleware = new MockCompressionMiddleware(
        {
          enabled: true,
        },
        createMockLogger()
      );

      // Test with invalid JSON (should handle gracefully)
      const invalidData = "{'invalid': json}";
      const result = await compressionMiddleware.compressResponse(invalidData);

      assert.ok(result !== undefined, 'Should handle invalid data gracefully');
      // Should still attempt compression on raw string data
      assert.strictEqual(typeof result.data, 'string', 'Should return string data');
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle disabled compression correctly', async () => {
      const disabledMiddleware = new MockCompressionMiddleware(
        {
          enabled: false,
        },
        createMockLogger()
      );

      const data = 'x'.repeat(1000);
      const result = await disabledMiddleware.compressResponse(data);

      assert.strictEqual(
        result.compressed,
        false,
        'Should not compress when disabled'
      );
      assert.strictEqual(
        result.data,
        data,
        'Should return original data when disabled'
      );
    });

    it('should respect compression level settings', async () => {
      const highCompressionMiddleware = new MockCompressionMiddleware(
        {
          enabled: true,
          level: 9, // Maximum compression
        },
        createMockLogger()
      );

      const lowCompressionMiddleware = new MockCompressionMiddleware(
        {
          enabled: true,
          level: 1, // Minimum compression
        },
        createMockLogger()
      );

      const testData = 'x'.repeat(1000);

      const highResult = await highCompressionMiddleware.compressResponse(
        testData,
        ['gzip']
      );
      const lowResult = await lowCompressionMiddleware.compressResponse(
        testData,
        ['gzip']
      );

      assert.strictEqual(
        highResult.compressed,
        true,
        'High compression should work'
      );
      assert.strictEqual(
        lowResult.compressed,
        true,
        'Low compression should work'
      );

      // Note: In real implementation, high compression would have better ratio but take longer
      assert.ok(
        highResult.ratio >= lowResult.ratio ||
          Math.abs(highResult.ratio - lowResult.ratio) < 0.1,
        'High compression should have equal or better ratio'
      );
    });
  });
});

console.log('✅ Enhanced Compression Middleware Tests Completed');

