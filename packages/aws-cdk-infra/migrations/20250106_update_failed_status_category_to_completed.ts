import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import { Migration, MigrationContext, MigrationResult } from './types';

/**
 * Migration to update statusCategory from 'failed' to 'completed'
 *
 * This migration:
 * 1. Scans all workflow records in the table
 * 2. For each record with statusCategory: 'failed':
 *    - Updates statusCategory to 'completed'
 *    - Updates statusCategoryCreatedAt to replace 'failed#' prefix with 'completed#'
 * 3. Updates the record with the new statusCategory values
 *
 * This migration is idempotent - it can be run multiple times safely.
 * Records that already have statusCategory: 'completed' will be skipped.
 */
export const migration_20250106_update_failed_status_category_to_completed: Migration =
  {
    id: '20250106_update_failed_status_category_to_completed',
    description:
      'Update workflow records with statusCategory "failed" to "completed"',

    async up(context: MigrationContext): Promise<MigrationResult> {
      const {
        tableName,
        dryRun = false,
        log = console.log.bind(console),
        awsProfile,
        awsRegion,
      } = context;

      log(
        '🔍 Starting migration to update failed statusCategory to completed...'
      );

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
            // Filter to only get items with statusCategory = 'failed'
            FilterExpression: 'statusCategory = :failedStatus',
            ExpressionAttributeValues: {
              ':failedStatus': 'failed',
            },
          };

          log?.(
            `📊 Scanning batch starting from key: ${
              lastEvaluatedKey ? JSON.stringify(lastEvaluatedKey) : 'beginning'
            }`
          );

          const scanResult = await client.send(new ScanCommand(scanParams));
          const items = scanResult.Items || [];
          totalScanned += items.length;

          log?.(
            `📋 Found ${items.length} items with statusCategory='failed' in this batch (${totalScanned} total scanned)`
          );

          // 2) Process each item with statusCategory = 'failed'
          for (const item of items) {
            itemsProcessed++;

            // Validate required fields
            if (
              typeof item.userId !== 'string' ||
              typeof item.workflowId !== 'string' ||
              typeof item.statusCategory !== 'string' ||
              typeof item.statusCategoryCreatedAt !== 'string'
            ) {
              log?.(
                `⚠️  Skipping item due to missing required fields: ${JSON.stringify(
                  item
                )}`
              );
              continue;
            }

            // Double-check that statusCategory is 'failed' (should be due to filter, but being safe)
            if (item.statusCategory !== 'failed') {
              log?.(
                `⚠️  Skipping item ${item.userId}#${item.workflowId} - statusCategory is not 'failed': ${item.statusCategory}`
              );
              continue;
            }

            // Update statusCategoryCreatedAt by replacing 'failed#' with 'completed#'
            const oldStatusCategoryCreatedAt =
              item.statusCategoryCreatedAt as string;
            const newStatusCategoryCreatedAt =
              oldStatusCategoryCreatedAt.replace(/^failed#/, 'completed#');

            log?.(
              `🔄 Processing ${item.userId}#${item.workflowId}: statusCategory='failed' -> 'completed'`
            );

            if (!dryRun) {
              const updateParams: UpdateCommandInput = {
                TableName: tableName,
                Key: {
                  userId: item.userId,
                  workflowId: item.workflowId,
                },
                UpdateExpression:
                  'SET statusCategory = :newStatus, statusCategoryCreatedAt = :newStatusCategoryCreatedAt',
                // Only update if the current statusCategory is still 'failed' (avoid race conditions)
                ConditionExpression: 'statusCategory = :currentStatus',
                ExpressionAttributeValues: {
                  ':newStatus': 'completed',
                  ':newStatusCategoryCreatedAt': newStatusCategoryCreatedAt,
                  ':currentStatus': 'failed',
                },
                ReturnValues: 'ALL_NEW',
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
            } else {
              // Dry-run: just count it
              itemsModified++;
              log?.(
                `🔍 [DRY-RUN] Would update ${item.userId}#${item.workflowId}: statusCategory='failed' -> 'completed'`
              );
            }
          }

          lastEvaluatedKey = scanResult.LastEvaluatedKey;

          // Pause between batches if there's more to scan
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
        log?.(
          `   - Total items with statusCategory='failed' scanned: ${totalScanned}`
        );
        log?.(`   - Workflow items processed: ${itemsProcessed}`);
        log?.(
          `   - Items ${
            dryRun ? 'that would be ' : ''
          }modified: ${itemsModified}`
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
