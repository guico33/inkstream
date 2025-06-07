import type { WorkflowStatus, WorkflowStatusCategory } from './workflow-types';

export function getStatusCategory(
  status: WorkflowStatus
): WorkflowStatusCategory {
  switch (status) {
    case 'STARTING':
    case 'EXTRACTING_TEXT':
    case 'FORMATTING_TEXT':
    case 'TRANSLATING':
    case 'CONVERTING_TO_SPEECH':
    case 'TEXT_FORMATTING_COMPLETE':
    case 'TRANSLATION_COMPLETE':
      return 'active';
    case 'SUCCEEDED':
      return 'completed';
    case 'FAILED':
    case 'TIMED_OUT':
      return 'completed';
    default:
      return 'completed';
  }
}
