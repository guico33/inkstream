# DynamoDB Migrations

This directory contains migration scripts for DynamoDB schema and data updates.

## Overview

Migrations allow you to safely update your DynamoDB table structure and data in a controlled manner. Each migration is a TypeScript file that implements the `Migration` interface.

## Running Migrations

Use the migration runner script:

```bash
# Run all pending migrations
npm run migrations

# Dry run to see what would be changed (recommended first)
npm run migrations -- --dry-run

# Run with specific AWS profile and region
npm run migrations -- --profile my-profile --region us-east-1

# Verbose output
npm run migrations -- --verbose
```

## Migration File Structure

Each migration file follows this pattern:

```typescript
import { Migration, MigrationContext, MigrationResult } from './types';

export const migration_YYYYMMDD_description: Migration = {
  id: 'YYYYMMDD_description',
  description: 'Human-readable description of what this migration does',
  
  async up(context: MigrationContext): Promise<MigrationResult> {
    // Migration logic here
    // Use context.dryRun to check if this is a dry run
    // Use context.log for progress logging
    
    return {
      success: true,
      itemsProcessed: 0,
      itemsModified: 0,
    };
  },
};
```

## Best Practices

1. **Always test with dry run first**: Use `--dry-run` to see what would be changed
2. **Use descriptive names**: Include date and clear description in migration ID
3. **Make migrations idempotent**: They should be safe to run multiple times
4. **Process in batches**: For large datasets, process items in small batches
5. **Add delays between batches**: Avoid overwhelming DynamoDB with too many requests
6. **Handle errors gracefully**: Log errors but continue processing other items
7. **Use the DocumentClient**: Use the high-level API for simpler data access

## Migration Context

The `MigrationContext` provides:

- `tableName`: DynamoDB table to operate on
- `dryRun`: Whether this is a dry run (don't make actual changes)
- `log`: Function for progress logging
- `awsProfile`: AWS profile for credentials
- `awsRegion`: AWS region to use

## Example Migrations

See existing migration files for examples:
- `20241220_add_status_category_fields.ts` - Adding new fields to existing records
