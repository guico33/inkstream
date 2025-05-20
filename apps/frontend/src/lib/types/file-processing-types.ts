export type ProcessingStatus =
  | 'idle'
  | 'selecting'
  | 'uploading'
  | 'starting_workflow'
  | 'workflow_running'
  | 'workflow_succeeded'
  | 'workflow_failed';
