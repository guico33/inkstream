import { WorkflowRecord } from '@inkstream/shared';

/**
 * Represents a single migration that can be executed
 */
export interface Migration {
  /** Unique identifier for the migration (typically timestamp + description) */
  id: string;
  /** Human-readable description of what this migration does */
  description: string;
  /** Function that executes the migration */
  up: (context: MigrationContext) => Promise<MigrationResult>;
}

/**
 * Context provided to migrations during execution
 */
export interface MigrationContext {
  /** Name of the DynamoDB table to operate on */
  tableName: string;
  /** Flag to enable dry-run mode (don't actually make changes) */
  dryRun?: boolean;
  /** Optional logger function for progress reporting */
  log?: (message: string) => void;
  /** AWS profile to use for credentials */
  awsProfile?: string;
  /** AWS region to use */
  awsRegion?: string;
}

/**
 * Result of migration execution
 */
export interface MigrationResult {
  /** Whether the migration completed successfully */
  success: boolean;
  /** Number of items processed */
  itemsProcessed: number;
  /** Number of items actually modified */
  itemsModified: number;
  /** Any error message if migration failed */
  error?: string;
  /** Additional details about the migration execution */
  details?: Record<string, any>;
}

/**
 * Tracks migration execution history
 */
export interface MigrationRecord {
  /** The migration ID that was executed */
  migrationId: string;
  /** When the migration was executed */
  executedAt: string;
  /** Result of the migration execution */
  result: MigrationResult;
}

/**
 * Configuration for migration execution
 */
export interface MigrationConfig {
  /** DynamoDB table name to operate on */
  tableName: string;
  /** Whether to run in dry-run mode */
  dryRun?: boolean;
  /** Whether to show verbose logging */
  verbose?: boolean;
  /** Maximum number of concurrent operations */
  concurrency?: number;
  /** AWS profile to use for credentials */
  awsProfile?: string;
  /** AWS region to use */
  awsRegion?: string;
}
