import axios from 'axios';
import { encode } from 'querystring';
import config, { isProduction } from '../config';
import Logger from '../Logger';

const GOOGLE_RECAPTCHA_V3_ENDPOINT = config.RECAPTCHA_V3_ENDPOINT;

const MAX_RECAPTCHA_ATTEMPTS = 3;
const RECAPTCHA_RETRY_BASE_DELAY_MS = 300;
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

async function requestRecaptcha(captcha: string): Promise<boolean> {
  const body = {
    secret: config.RECAPTCHA_V3,
    response: captcha,
  };

  const res = await axios.post(GOOGLE_RECAPTCHA_V3_ENDPOINT, encode(body), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!res.data.success) {
    throw new Error(res.data['error-codes']);
  }

  const scoreThreshold = config.RECAPTCHA_V3_SCORE_THRESHOLD ?? 0.5;
  const { score } = res.data;

  if (score < scoreThreshold) {
    throw new Error(`Score ${score} under ${scoreThreshold}`);
  }

  return res.data.success;
}

export async function verifyRecaptcha(captcha: string) {
  if (!isProduction) {
    return true;
  }

  for (let attempt = 0; attempt < MAX_RECAPTCHA_ATTEMPTS; attempt++) {
    try {
      return await requestRecaptcha(captcha);
    } catch (err) {
      const isLastAttempt = attempt === MAX_RECAPTCHA_ATTEMPTS - 1;

      if (!isTransientNetworkError(err) || isLastAttempt) {
        throw err;
      }

      const delay = RECAPTCHA_RETRY_BASE_DELAY_MS * 2 ** attempt;
      Logger.warn(
        `reCAPTCHA verification failed with EAI_AGAIN, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RECAPTCHA_ATTEMPTS})`,
      );
      await sleep(delay);
    }
  }
}
