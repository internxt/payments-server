import axios from 'axios';
import { encode } from 'node:querystring';
import config, { isProduction } from '../config';
import Logger from '../Logger';
import { isTransientNetworkError, sleep } from './networkRetry';
import {
  CAPTCHA_MAX_ATTEMPTS,
  CAPTCHA_RETRY_BASE_DELAY_MS,
  DEFAULT_RECAPTCHA_SCORE_THRESHOLD,
} from './captcha.constants';

const GOOGLE_RECAPTCHA_V3_ENDPOINT = config.RECAPTCHA_V3_ENDPOINT;

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

  const scoreThreshold = config.RECAPTCHA_V3_SCORE_THRESHOLD ?? DEFAULT_RECAPTCHA_SCORE_THRESHOLD;
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

  for (let attempt = 0; attempt < CAPTCHA_MAX_ATTEMPTS; attempt++) {
    try {
      return await requestRecaptcha(captcha);
    } catch (err) {
      const isLastAttempt = attempt === CAPTCHA_MAX_ATTEMPTS - 1;

      if (!isTransientNetworkError(err) || isLastAttempt) {
        throw err;
      }

      const delay = CAPTCHA_RETRY_BASE_DELAY_MS * 2 ** attempt;
      Logger.warn(
        `reCAPTCHA verification failed with EAI_AGAIN, retrying in ${delay}ms (attempt ${attempt + 1}/${CAPTCHA_MAX_ATTEMPTS})`,
      );
      await sleep(delay);
    }
  }
}
