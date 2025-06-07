import { PreSignUpTriggerEvent, PreSignUpTriggerHandler } from 'aws-lambda';

/**
 * Cognito Pre-Signup Lambda Trigger
 * 
 * This function validates email addresses against a whitelist before allowing
 * user registration. It works for both Google OAuth and email/password signups.
 * 
 * Environment Variables:
 * - ALLOWED_EMAILS: Comma-separated list of whitelisted email addresses
 */

export const handler: PreSignUpTriggerHandler = async (event: PreSignUpTriggerEvent) => {
  const email = event.request.userAttributes.email?.toLowerCase();
  
  console.log(`Pre-signup validation for email: ${email}`);
  
  // Get allowed emails from environment variable
  const allowedEmailsEnv = process.env.ALLOWED_EMAILS;
  
  if (!allowedEmailsEnv) {
    console.error('ALLOWED_EMAILS environment variable not set');
    throw new Error('Email validation configuration error');
  }
  
  // Parse comma-separated email list and normalize to lowercase
  const allowedEmails = allowedEmailsEnv
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);
  
  console.log(`Checking against ${allowedEmails.length} whitelisted emails`);
  
  if (!email) {
    console.error('No email provided in signup request');
    throw new Error('Email address is required');
  }
  
  // Check if email is in whitelist
  if (!allowedEmails.includes(email)) {
    console.warn(`Signup blocked for non-whitelisted email: ${email}`);
    throw new Error(`Email ${email} is not authorized for this environment. Please contact your administrator.`);
  }
  
  console.log(`Signup approved for whitelisted email: ${email}`);
  
  // Return the event to allow signup to proceed
  return event;
};