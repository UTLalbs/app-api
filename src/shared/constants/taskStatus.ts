import type { TaskStatus, TaskPriority } from '../../modules/tasks/task.types';

export const TASK_STATUS = {
  OPEN:        'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED:    'resolved',
  IGNORED:     'ignored',
  CANCELLED:   'cancelled',
} as const satisfies Record<string, TaskStatus>;

export const TASK_PRIORITY = {
  LOW:      'low',
  MEDIUM:   'medium',
  HIGH:     'high',
  CRITICAL: 'critical',
} as const satisfies Record<string, TaskPriority>;
