import { Handler } from 'aws-lambda';

export const handler: Handler = async (event) => {
  console.log('Format Lambda invoked with event:', JSON.stringify(event));

  // Keep all original properties and add our result
  // This ensures doTranslate, doSpeech and other properties remain at the root level
  return {
    ...event,
    formatResult: 'Format step succeeded',
  };
};
