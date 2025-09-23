/**
 * Common types and interfaces used across domains
 */

// Base result type for all operations
export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

// Success result helper
export function success<T>(data: T): Result<T, never> {
  return { success: true, data };
}

// Error result helper
export function failure<E = Error>(error: E): Result<never, E> {
  return { success: false, error };
}

// Base entity interface
export interface Entity {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Request/Response interfaces
export interface PaginatedRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// Cache interfaces
export interface CacheEntry<T> {
  value: T;
  expiry: number;
}

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Logger interfaces
export interface LogContext {
  operation?: string;
  userId?: string;
  requestId?: string;
  duration?: number;
  [key: string]: any;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  startTimer(operation: string): () => number;
}

// Event interfaces
export interface DomainEvent {
  id: string;
  type: string;
  timestamp: Date;
  data: any;
}

export interface EventHandler<T extends DomainEvent> {
  handle(event: T): Promise<void>;
}

// Configuration interfaces
export interface ConfigValue<T> {
  value: T;
  source: 'default' | 'env' | 'file' | 'override';
  required: boolean;
}

export interface ConfigProvider {
  get<T>(key: string): ConfigValue<T>;
  has(key: string): boolean;
  validate(): void;
}