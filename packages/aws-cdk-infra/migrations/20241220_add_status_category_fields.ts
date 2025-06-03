import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import { getStatusCategory } from '@inkstream/shared';
import { Migration, MigrationContext, MigrationResult } from './types';

/**
 * Migration to add statusCategory and statusCategoryCreatedAt fields to existing workflow records
 *
 * This migration:
 * 1. Scans all workflow records in the table
 * 2. For each record missing statusCategory or statusCategoryCreatedAt:
 *    - Calculates statusCategory from the existing status field
 *    - Sets statusCategoryCreatedAt to statusCategory#createdAt (or current time if createdAt is missing)
 * 3. Updates the record with the new fields
 *
 * This migration is idempotent - it can be run multiple times safely.
 */
export const migration_20241220_add_status_category_fields: Migration = {
  id: '20241220_add_status_category_fields',
  description:
    'Add statusCategory and statusCategoryCreatedAt fields to existing workflow records',

  async up(context: MigrationContext): Promise<MigrationResult> {
    const {
      tableName,
      dryRun = false,
      log = console.log.bind(console),
      awsProfile,
      awsRegion,
    } = context;

    log('🔍 Starting migration to add status category fields...');

    // Use the AWS profile and region from context, then wrap in DocumentClient
    const credentials = awsProfile
      ? fromIni({ profile: awsProfile })
      : undefined;

    const rawClient = new DynamoDBClient({
      region: (() => {
        const resolvedRegion =
          awsRegion || process.env.AWS_REGION || 'eu-west-3';
        if (!awsRegion && !process.env.AWS_REGION) {
          log(
            '⚠️ Warning: AWS region is not explicitly set. Defaulting to "eu-west-3".'
          );
        }
        return resolvedRegion;
      })(),
      ...(credentials && { credentials }),
    });

    const client = DynamoDBDocumentClient.from(rawClient);

    let itemsProcessed = 0;
    let itemsModified = 0;
    let totalScanned = 0;
    const errors: string[] = [];

    try {
      let lastEvaluatedKey: Record<string, any> | undefined;

      do {
        // 1) Scan the table in batches of 100
        const scanParams = {
          TableName: tableName,
          Limit: 100,
          ExclusiveStartKey: lastEvaluatedKey,
        };

        log?.(
          `📊 Scanning batch starting from key: ${
            lastEvaluatedKey ? JSON.stringify(lastEvaluatedKey) : 'beginning'
          }`
        );

        // Because `client` is a DynamoDBDocumentClient, we use ScanCommand from lib-dynamodb.
        const scanResult = await client.send(new ScanCommand(scanParams));
        const items = scanResult.Items || [];
        totalScanned += items.length;

        log?.(
          `📋 Found ${items.length} items in this batch (${totalScanned} total scanned)`
        );

        // 2) Process each item
        for (const item of items) {
          itemsProcessed++;

          // In DocumentClient-land, each `item` is a plain JS object.
          // We expect: { userId: string, workflowId: string, status: string, ... }
          if (
            typeof item.userId !== 'string' ||
            typeof item.workflowId !== 'string' ||
            typeof item.status !== 'string'
          ) {
            log?.(
              `⚠️  Skipping item due to missing required fields (userId, workflowId, or status): ${JSON.stringify(
                item
              )}`
            );
            continue;
          }

          const status: string = item.status;
          const createdAt: string | undefined = item.createdAt as
            | string
            | undefined;
          const hasStatusCategory = typeof item.statusCategory === 'string';
          const hasStatusCategoryCreatedAt =
            typeof item.statusCategoryCreatedAt === 'string';

          // If both fields already exist, skip
          if (hasStatusCategory && hasStatusCategoryCreatedAt) {
            log?.(
              `✅ Item ${item.userId}#${item.workflowId} already has statusCategory fields`
            );
            continue;
          }

          // Calculate what we need to add
          const statusCategory = getStatusCategory(status as any);
          const timestamp = createdAt || new Date().toISOString();
          const statusCategoryCreatedAt = `${statusCategory}#${timestamp}`;

          log?.(
            `🔄 Processing ${item.userId}#${item.workflowId}: status=${status} -> statusCategory=${statusCategory}`
          );

          if (!dryRun) {
            // Build a dynamic UpdateExpression (only include missing fields)
            const updateExpressions: string[] = [];
            const expressionAttributeNames: Record<string, string> = {};
            const expressionAttributeValues: Record<string, any> = {};

            if (!hasStatusCategory) {
              updateExpressions.push('#sc = :sc');
              expressionAttributeNames['#sc'] = 'statusCategory';
              expressionAttributeValues[':sc'] = statusCategory;
            }

            if (!hasStatusCategoryCreatedAt) {
              updateExpressions.push('#scca = :scca');
              expressionAttributeNames['#scca'] = 'statusCategoryCreatedAt';
              expressionAttributeValues[':scca'] = statusCategoryCreatedAt;
            }

            // If nothing to update, skip
            if (updateExpressions.length === 0) {
              log?.(
                `⚠️ Nothing to update for ${item.userId}#${item.workflowId}`
              );
            } else {
              const updateExprString = 'SET ' + updateExpressions.join(', ');

              // 3) Use UpdateCommand from lib-dynamodb (DocumentClient) instead of UpdateItemCommand
              const updateParams: UpdateCommandInput = {
                TableName: tableName,
                Key: {
                  userId: item.userId,
                  workflowId: item.workflowId,
                },
                UpdateExpression: updateExprString,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW', // optional—useful if you want to inspect post-update attributes
              };

              try {
                await client.send(new UpdateCommand(updateParams));
                itemsModified++;
                log?.(`✅ Updated ${item.userId}#${item.workflowId}`);
              } catch (updateError) {
                const errorMsg = `Failed to update ${item.userId}#${
                  item.workflowId
                }: ${(updateError as Error).message}`;
                errors.push(errorMsg);
                log?.(`❌ ${errorMsg}`);
              }
            }
          } else {
            // Dry-run: just count it
            itemsModified++;
            log?.(
              `🔍 [DRY-RUN] Would update ${item.userId}#${item.workflowId} with statusCategory=${statusCategory}`
            );
          }
        }

        lastEvaluatedKey = scanResult.LastEvaluatedKey;

        // Pause between batches if there’s more to scan
        if (lastEvaluatedKey) {
          log?.('⏱️  Pausing 100ms between batches...');
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } while (lastEvaluatedKey);

      const result: MigrationResult = {
        success: errors.length === 0,
        itemsProcessed,
        itemsModified,
        error:
          errors.length > 0
            ? `${errors.length} errors occurred: ${errors.join(', ')}`
            : undefined,
        details: {
          totalScanned,
          errorCount: errors.length,
          dryRun,
          errors: errors.slice(0, 10),
        },
      };

      log?.(`🎯 Migration summary:`);
      log?.(`   - Total items scanned: ${totalScanned}`);
      log?.(`   - Workflow items processed: ${itemsProcessed}`);
      log?.(
        `   - Items ${dryRun ? 'that would be ' : ''}modified: ${itemsModified}`
      );
      log?.(`   - Errors: ${errors.length}`);

      return result;
    } catch (error) {
      log?.(`❌ Migration failed with error: ${(error as Error).message}`);
      return {
        success: false,
        itemsProcessed,
        itemsModified,
        error: (error as Error).message,
        details: {
          totalScanned,
          errorCount: errors.length,
          dryRun,
        },
      };
    }
  },
};
