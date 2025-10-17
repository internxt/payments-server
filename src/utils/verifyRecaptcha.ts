import axios from 'axios';
import { encode } from 'querystring';
import config, { isProduction } from '../config';

const GOOGLE_RECAPTCHA_V3_ENDPOINT = config.RECAPTCHA_V3_ENDPOINT;

export async function verifyRecaptcha(captcha: string) {
  if (!isProduction) {
    return true;
  }

  const body = {
    secret: config.RECAPTCHA_V3,
    response: captcha,
  };

  return axios
    .post(GOOGLE_RECAPTCHA_V3_ENDPOINT, encode(body), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    .then((res: any) => {
      if (!res.data.success) {
        throw Error(res.data['error-codes']);
      }

      const scoreThreshold = config.RECAPTCHA_V3_SCORE_THRESHOLD ?? 0.5;
      const { score } = res.data;

      if (score < scoreThreshold) {
        throw Error(`Score ${score} under ${scoreThreshold}`);
      }

      const data = res.data;

      return data.success;
    });
}
