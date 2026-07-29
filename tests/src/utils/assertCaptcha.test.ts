import { assertCaptcha } from '../../../src/utils/assertCaptcha';
import Logger from '../../../src/Logger';
import { ForbiddenError } from '../../../src/errors/Errors';
import { CAPTCHA_VERIFICATION_FAILED_MESSAGE } from '../../../src/utils/captcha.constants';
import { verifyRecaptcha } from '../../../src/utils/verifyRecaptcha';
import { TurnstileUnavailableError, verifyTurnstile } from '../../../src/utils/verifyTurnstile';

jest.mock('../../../src/utils/verifyRecaptcha', () => ({
  __esModule: true,
  verifyRecaptcha: jest.fn(),
}));

jest.mock('../../../src/utils/verifyTurnstile', () => {
  const actual = jest.requireActual('../../../src/utils/verifyTurnstile');
  return {
    __esModule: true,
    TurnstileUnavailableError: actual.TurnstileUnavailableError,
    verifyTurnstile: jest.fn(),
  };
});

const mockedVerifyTurnstile = verifyTurnstile as jest.MockedFunction<typeof verifyTurnstile>;
const mockedVerifyRecaptcha = verifyRecaptcha as jest.MockedFunction<typeof verifyRecaptcha>;

describe('Asserting that a request comes from a human', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('When Turnstile verifies the request, then reCAPTCHA is not consulted', async () => {
    mockedVerifyTurnstile.mockResolvedValue(true);

    await expect(assertCaptcha({ turnstileToken: 'turnstile-token', captchaToken: 'captcha-token' })).resolves.toBeUndefined();
    expect(mockedVerifyRecaptcha).not.toHaveBeenCalled();
  });

  test('When Turnstile cannot give a verdict, then reCAPTCHA takes over and the request is allowed', async () => {
    mockedVerifyTurnstile.mockRejectedValue(new TurnstileUnavailableError('internal-error'));
    mockedVerifyRecaptcha.mockResolvedValue(true);

    await expect(assertCaptcha({ turnstileToken: 'turnstile-token', captchaToken: 'captcha-token' })).resolves.toBeUndefined();
    expect(mockedVerifyRecaptcha).toHaveBeenCalledWith('captcha-token');
  });

  test('When Turnstile rejects the token, then the request is forbidden without consulting reCAPTCHA', async () => {
    mockedVerifyTurnstile.mockRejectedValue(new Error('invalid-input-response'));

    await expect(assertCaptcha({ turnstileToken: 'forged-token', captchaToken: 'captcha-token' })).rejects.toThrow(
      ForbiddenError,
    );
    expect(mockedVerifyRecaptcha).not.toHaveBeenCalled();
  });

  test('When both providers fail to verify the request, then the request is forbidden', async () => {
    mockedVerifyTurnstile.mockRejectedValue(new TurnstileUnavailableError('EAI_AGAIN'));
    mockedVerifyRecaptcha.mockRejectedValue(new Error('invalid-input-response'));

    await expect(assertCaptcha({ turnstileToken: 'turnstile-token', captchaToken: 'captcha-token' })).rejects.toThrow(
      ForbiddenError,
    );
  });

  test('When Turnstile is unavailable and there is no reCAPTCHA token, then the request is forbidden', async () => {
    mockedVerifyTurnstile.mockRejectedValue(new TurnstileUnavailableError('EAI_AGAIN'));

    await expect(assertCaptcha({ turnstileToken: 'turnstile-token' })).rejects.toThrow(ForbiddenError);
    expect(mockedVerifyRecaptcha).not.toHaveBeenCalled();
  });

  test('When only a reCAPTCHA token is sent, then it alone can verify the request', async () => {
    mockedVerifyRecaptcha.mockResolvedValue(true);

    await expect(assertCaptcha({ captchaToken: 'captcha-token' })).resolves.toBeUndefined();
    expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
  });

  test('When no token is sent at all, then the request is forbidden', async () => {
    await expect(assertCaptcha({})).rejects.toThrow(ForbiddenError);
    expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    expect(mockedVerifyRecaptcha).not.toHaveBeenCalled();
  });

  test('When reCAPTCHA answers without verifying the request, then the request is forbidden', async () => {
    mockedVerifyRecaptcha.mockResolvedValue(undefined);

    await expect(assertCaptcha({ captchaToken: 'captcha-token' })).rejects.toThrow(ForbiddenError);
  });
});
