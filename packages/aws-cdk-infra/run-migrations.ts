#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';
import { migration_20241220_add_status_category_fields } from './migrations/20241220_add_status_category_fields';
import {
  Migration,
  MigrationConfig,
  MigrationContext,
  MigrationRecord,
} from './migrations/types';

// Load environment variables from .env.migrations
dotenv.config({ path: path.join(__dirname, '.env.migrations') });

/**
 * List of all migrations in order of execution
 */
const MIGRATIONS: Migration[] = [migration_20241220_add_status_category_fields];

/**
 * Migration runner that executes all pending migrations
 */
class MigrationRunner {
  private readonly config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
  }

  /**
   * Run all pending migrations
   */
  async run(): Promise<void> {
    this.log('🚀 Starting migration runner...');

    if (this.config.dryRun) {
      this.log('🔍 Running in DRY-RUN mode - no changes will be made');
    }

    // Get list of executed migrations
    const executedMigrations = await this.getExecutedMigrations();
    const executedIds = new Set(executedMigrations.map((m) => m.migrationId));

    // Find pending migrations
    const pendingMigrations = MIGRATIONS.filter((m) => !executedIds.has(m.id));

    if (pendingMigrations.length === 0) {
      this.log('✅ No pending migrations found');
      return;
    }

    this.log(`📋 Found ${pendingMigrations.length} pending migration(s):`);
    pendingMigrations.forEach((m) => {
      this.log(`  - ${m.id}: ${m.description}`);
    });

    // Execute each pending migration
    for (const migration of pendingMigrations) {
      await this.executeMigration(migration);
    }

    this.log('🎉 All migrations completed successfully!');
  }

  /**
   * Execute a single migration
   */
  private async executeMigration(migration: Migration): Promise<void> {
    this.log(`\n🔄 Executing migration: ${migration.id}`);
    this.log(`📝 Description: ${migration.description}`);

    const context: MigrationContext = {
      tableName: this.config.tableName,
      dryRun: this.config.dryRun,
      log: this.config.verbose ? this.log.bind(this) : undefined,
      awsProfile: this.config.awsProfile,
      awsRegion: this.config.awsRegion,
    };

    try {
      const startTime = Date.now();
      const result = await migration.up(context);
      const duration = Date.now() - startTime;

      if (result.success) {
        this.log(`✅ Migration completed successfully in ${duration}ms`);
        this.log(
          `📊 Processed: ${result.itemsProcessed}, Modified: ${result.itemsModified}`
        );

        if (result.details) {
          this.log(`📋 Details: ${JSON.stringify(result.details, null, 2)}`);
        }

        // Record successful migration (unless in dry-run mode)
        if (!this.config.dryRun) {
          await this.recordMigration(migration.id, result);
        }
      } else {
        throw new Error(result.error || 'Migration failed with unknown error');
      }
    } catch (error) {
      this.log(`❌ Migration failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get list of previously executed migrations
   * For simplicity, we store this as a simple JSON file
   */
  private async getExecutedMigrations(): Promise<MigrationRecord[]> {
    // In a real implementation, you might store this in DynamoDB or a file
    // For now, we'll assume this is a fresh start
    return [];
  }

  /**
   * Record that a migration was executed successfully
   */
  private async recordMigration(
    migrationId: string,
    _result: any
  ): Promise<void> {
    // In a real implementation, you'd persist this to a tracking system
    this.log(`📝 Recording migration execution: ${migrationId}`);
  }

  /**
   * Log a message with timestamp
   */
  private log(message: string): void {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
}

/**
 * Main function to run migrations
 */
async function main() {
  const tableName = process.env.USER_WORKFLOWS_TABLE;
  const awsProfile = process.env.AWS_PROFILE;
  const awsRegion = process.env.AWS_REGION;

  if (!tableName) {
    console.error(
      '❌ Error: USER_WORKFLOWS_TABLE environment variable is required'
    );
    console.error(
      '💡 Tip: Set it in .env.migrations file or as an environment variable'
    );
    process.exit(1);
  }

  if (!awsProfile) {
    console.error('❌ Error: AWS_PROFILE environment variable is required');
    console.error(
      '💡 Tip: Set it in .env.migrations file (e.g., AWS_PROFILE=dev)'
    );
    process.exit(1);
  }

  // Parse command line arguments (can override .env settings)
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const verbose = args.includes('--verbose') || process.env.VERBOSE === 'true';

  console.log(`🔧 Configuration:`);
  console.log(`   - Table: ${tableName}`);
  console.log(`   - AWS Profile: ${awsProfile}`);
  console.log(`   - AWS Region: ${awsRegion || 'default'}`);
  console.log(`   - Dry Run: ${dryRun}`);
  console.log(`   - Verbose: ${verbose}`);
  console.log('');

  const config: MigrationConfig = {
    tableName,
    dryRun,
    verbose,
    concurrency: 10, // Process up to 10 items concurrently
    awsProfile,
    awsRegion,
  };

  try {
    const runner = new MigrationRunner(config);
    await runner.run();
  } catch (error) {
    console.error('❌ Migration runner failed:', (error as Error).message);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}
