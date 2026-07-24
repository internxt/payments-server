import axios from 'axios';
import { encode } from 'querystring';
import config, { isProduction } from '../config';
import Logger from '../Logger';

const CLOUDFLARE_TURNSTILE_ENDPOINT = config.TURNSTILE_ENDPOINT;

const MAX_TURNSTILE_ATTEMPTS = 3;
const TURNSTILE_RETRY_BASE_DELAY_MS = 300;
const TRANSIENT_NETWORK_ERRORS = ['EAI_AGAIN'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getNetworkErrorCode = (err: unknown): string | undefined => {
  if (!axios.isAxiosError(err)) {
    return undefined;
  }

  const cause = err.cause as { code?: string } | undefined;
  return err.code ?? cause?.code;
};

const isTransientNetworkError = (err: unknown): boolean => {
  const code = getNetworkErrorCode(err);
  return !!code && TRANSIENT_NETWORK_ERRORS.includes(code);
};

async function requestTurnstile(turnstileToken: string, remoteIp?: string): Promise<boolean> {
  const body: Record<string, string> = {
    secret: config.TURNSTILE_SECRET,
    response: turnstileToken,
  };

  if (remoteIp) {
    body.remoteip = remoteIp;
  }

  const res = await axios.post(CLOUDFLARE_TURNSTILE_ENDPOINT, encode(body), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!res.data.success) {
    throw new Error(res.data['error-codes']);
  }

  return res.data.success;
}

export async function verifyTurnstile(turnstileToken: string, remoteIp?: string) {
  if (!isProduction) {
    return true;
  }

  for (let attempt = 0; attempt < MAX_TURNSTILE_ATTEMPTS; attempt++) {
    try {
      return await requestTurnstile(turnstileToken, remoteIp);
    } catch (err) {
      const isLastAttempt = attempt === MAX_TURNSTILE_ATTEMPTS - 1;

      if (!isTransientNetworkError(err) || isLastAttempt) {
        throw err;
      }

      const delay = TURNSTILE_RETRY_BASE_DELAY_MS * 2 ** attempt;
      Logger.warn(
        `Turnstile verification failed with EAI_AGAIN, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_TURNSTILE_ATTEMPTS})`,
      );
      await sleep(delay);
    }
  }
}
