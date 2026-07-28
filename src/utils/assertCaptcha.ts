import { ForbiddenError } from '../errors/Errors';
import Logger from '../Logger';
import { verifyRecaptcha } from './verifyRecaptcha';
import { TurnstileUnavailableError, verifyTurnstile } from './verifyTurnstile';

type CaptchaTokens = {
  turnstileToken?: string;
  captchaToken?: string;
};

export async function assertCaptcha({ turnstileToken, captchaToken }: CaptchaTokens): Promise<void> {
  if (turnstileToken) {
    try {
      const isVerified = await verifyTurnstile(turnstileToken);

      if (isVerified) {
        return;
      }

      throw new Error('Turnstile did not verify the token');
    } catch (err) {
      const message = (err as Error).message;

      if (!(err instanceof TurnstileUnavailableError)) {
        Logger.warn(`Turnstile rejected the token: ${message}`);
        throw new ForbiddenError('Token verification failed');
      }

      Logger.warn(`Turnstile could not verify the token, falling back to reCAPTCHA: ${message}`);
    }
  }

  if (!captchaToken) {
    throw new ForbiddenError('Token verification failed');
  }

  try {
    const isVerified = await verifyRecaptcha(captchaToken);

    if (!isVerified) {
      throw new Error('reCAPTCHA did not verify the token');
    }
  } catch (err) {
    Logger.warn(`reCAPTCHA verification failed: ${(err as Error).message}`);
    throw new ForbiddenError('Token verification failed');
  }
}
