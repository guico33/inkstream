import type { User } from './types/user-types';

export const getUserDisplayName = (user: User | null) => {
  if (!user) {
    return '';
  }

  if (user.name && user.name !== 'undefined') {
    return user.name;
  } else if (user.given_name && user.family_name) {
    return `${user.given_name} ${user.family_name}`;
  } else if (user.given_name) {
    return user.given_name;
  } else {
    return user.email || '';
  }
};

// get the last part of the execution arn, after the last colon
export const getWorkflowDisplayId = (workflowId: string | undefined) => {
  if (!workflowId) return '';
  const parts = workflowId.split(':');
  return parts[parts.length - 1];
};
