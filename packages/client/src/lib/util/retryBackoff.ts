// retryBackoff.ts

import { default as axios } from 'axios';

/**
 * Implement retry with exponential backoff
 * @param fn - The API function to be retried
 * @param retries - Number of retries allowed
 * @param delay - Delay in milliseconds
 */
const retryWithBackoff = async (fn: Function, retries: number = 3, delay: number = 1000): Promise<any> => {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;
    console.log(`Retrying in ${delay}ms... (${retries} retries left)`);
    await new Promise(res => setTimeout(res, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2); // Exponential backoff
  }
};

export default retryWithBackoff;
