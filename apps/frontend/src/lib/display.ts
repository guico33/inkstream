import type { User } from './types/user-types';

export interface WorkflowOutputData {
  // Define the structure of your expected workflow output here
  // For example:
  // extractedText?: string;
  // translatedText?: string;
  // audioFileUrl?: string;
  [key: string]: unknown; // Allows for other properties, but be more specific if possible
}

export interface WorkflowStatusDetails {
  status?: string;
  output?: WorkflowOutputData | string; // string for cases where output might be a simple message
  error?: string;
  cause?: string;
}

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
