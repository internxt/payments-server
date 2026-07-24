import { ForbiddenError } from '../errors/Errors';
import Logger from '../Logger';
import { verifyRecaptcha } from './verifyRecaptcha';
import { verifyTurnstile } from './verifyTurnstile';

interface CaptchaTokens {
  captchaToken?: string;
  turnstileToken?: string;
}

export async function assertCaptcha({ captchaToken, turnstileToken }: CaptchaTokens, remoteIp?: string): Promise<void> {
  if (turnstileToken) {
    try {
      if (await verifyTurnstile(turnstileToken, remoteIp)) return;
    } catch (err) {
      Logger.warn(`Turnstile verification failed, falling back to reCAPTCHA: ${(err as Error).message}`);
    }
  }

  if (captchaToken && (await verifyRecaptcha(captchaToken))) return;

  throw new ForbiddenError('Token verification failed');
}
