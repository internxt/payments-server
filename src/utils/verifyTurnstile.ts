import axios from 'axios';
import { encode } from 'node:querystring';
import config from '../config';
import Logger from '../Logger';
import { isTransientNetworkError, sleep } from './networkRetry';
import {
  CAPTCHA_MAX_ATTEMPTS,
  CAPTCHA_RETRY_BASE_DELAY_MS,
  UNKNOWN_CAPTCHA_REJECTION_REASON,
} from './captcha.constants';

const RETRYABLE_TURNSTILE_ERROR_CODE = 'internal-error';

type TurnstileVerificationResponse = {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
};

export class TurnstileUnavailableError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, TurnstileUnavailableError.prototype);
  }
}

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
    const rejectionReason = errorCodes.join(', ') || UNKNOWN_CAPTCHA_REJECTION_REASON;

    if (errorCodes.includes(RETRYABLE_TURNSTILE_ERROR_CODE)) {
      throw new TurnstileUnavailableError(rejectionReason);
    }

    throw new Error(rejectionReason);
  }

  return res.data.success;
}

function isRetryableTurnstileError(err: unknown): boolean {
  return isTransientNetworkError(err) || err instanceof TurnstileUnavailableError;
}

export async function verifyTurnstile(turnstileToken: string): Promise<boolean> {
  for (let attempt = 0; attempt < CAPTCHA_MAX_ATTEMPTS; attempt++) {
    try {
      return await requestTurnstile(turnstileToken);
    } catch (err) {
      const isLastAttempt = attempt === CAPTCHA_MAX_ATTEMPTS - 1;
      const isRetryable = isRetryableTurnstileError(err);

      if (!isRetryable) {
        throw err;
      }

      if (isLastAttempt) {
        throw new TurnstileUnavailableError((err as Error).message);
      }

      const delay = CAPTCHA_RETRY_BASE_DELAY_MS * 2 ** attempt;
      Logger.warn(
        `Turnstile verification failed with a transient error, retrying in ${delay}ms (attempt ${attempt + 1}/${CAPTCHA_MAX_ATTEMPTS})`,
      );
      await sleep(delay);
    }
  }

  throw new TurnstileUnavailableError('Turnstile verification exhausted every attempt');
}
