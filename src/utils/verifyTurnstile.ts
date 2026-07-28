import axios from 'axios';
import { encode } from 'node:querystring';
import config from '../config';
import Logger from '../Logger';
import { isTransientNetworkError, sleep } from './networkRetry';

const MAX_TURNSTILE_ATTEMPTS = 3;
const TURNSTILE_RETRY_BASE_DELAY_MS = 300;
const RETRYABLE_TURNSTILE_ERROR_CODE = 'internal-error';

type TurnstileVerificationResponse = {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
};

export class TurnstileUnavailableError extends Error {}

async function requestTurnstile(turnstileToken: string): Promise<boolean> {
  const body = {
    secret: config.TURNSTILE_SECRET,
    response: turnstileToken,
  };

  const res = await axios.post<TurnstileVerificationResponse>(config.TURNSTILE_ENDPOINT, encode(body), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!res.data.success) {
    const errorCodes = res.data['error-codes'] ?? [];

    if (errorCodes.includes(RETRYABLE_TURNSTILE_ERROR_CODE)) {
      throw new TurnstileUnavailableError(errorCodes.join(', '));
    }

    throw new Error(errorCodes.join(', '));
  }

  return res.data.success;
}

export async function verifyTurnstile(turnstileToken: string): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_TURNSTILE_ATTEMPTS; attempt++) {
    try {
      return await requestTurnstile(turnstileToken);
    } catch (err) {
      const isLastAttempt = attempt === MAX_TURNSTILE_ATTEMPTS - 1;
      const isRetryable = isTransientNetworkError(err) || err instanceof TurnstileUnavailableError;

      if (!isRetryable) {
        throw err;
      }

      if (isLastAttempt) {
        throw new TurnstileUnavailableError((err as Error).message);
      }

      const delay = TURNSTILE_RETRY_BASE_DELAY_MS * 2 ** attempt;
      Logger.warn(
        `Turnstile verification failed with a transient error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_TURNSTILE_ATTEMPTS})`,
      );
      await sleep(delay);
    }
  }

  throw new TurnstileUnavailableError('Turnstile verification exhausted every attempt');
}
