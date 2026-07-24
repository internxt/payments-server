import { assertCaptcha } from '../../../src/utils/assertCaptcha';
import { verifyTurnstile } from '../../../src/utils/verifyTurnstile';
import { verifyRecaptcha } from '../../../src/utils/verifyRecaptcha';
import { ForbiddenError } from '../../../src/errors/Errors';

jest.mock('../../../src/utils/verifyTurnstile');
jest.mock('../../../src/utils/verifyRecaptcha');

const mockedVerifyTurnstile = verifyTurnstile as jest.MockedFunction<typeof verifyTurnstile>;
const mockedVerifyRecaptcha = verifyRecaptcha as jest.MockedFunction<typeof verifyRecaptcha>;

describe('Verify checkout captcha with Turnstile as primary and reCAPTCHA as fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('When the Turnstile token is valid, then it verifies with Turnstile and skips reCAPTCHA', async () => {
    mockedVerifyTurnstile.mockResolvedValue(true);

    await expect(assertCaptcha({ turnstileToken: 'ts-token' }, '203.0.113.5')).resolves.toBeUndefined();

    expect(mockedVerifyTurnstile).toHaveBeenCalledWith('ts-token', '203.0.113.5');
    expect(mockedVerifyRecaptcha).not.toHaveBeenCalled();
  });

  test('When Turnstile fails but a reCAPTCHA token is present and valid, then it falls back and succeeds', async () => {
    mockedVerifyTurnstile.mockRejectedValue(new Error('internal-error'));
    mockedVerifyRecaptcha.mockResolvedValue(true);

    await expect(assertCaptcha({ turnstileToken: 'ts-token', captchaToken: 'rc-token' })).resolves.toBeUndefined();

    expect(mockedVerifyTurnstile).toHaveBeenCalledTimes(1);
    expect(mockedVerifyRecaptcha).toHaveBeenCalledWith('rc-token');
  });

  test('When Turnstile fails and no reCAPTCHA token is present, then it rejects with ForbiddenError', async () => {
    mockedVerifyTurnstile.mockRejectedValue(new Error('internal-error'));

    await expect(assertCaptcha({ turnstileToken: 'ts-token' })).rejects.toBeInstanceOf(ForbiddenError);

    expect(mockedVerifyRecaptcha).not.toHaveBeenCalled();
  });

  test('When both Turnstile and the reCAPTCHA fallback fail, then it rejects with ForbiddenError', async () => {
    mockedVerifyTurnstile.mockRejectedValue(new Error('internal-error'));
    mockedVerifyRecaptcha.mockResolvedValue(false);

    await expect(assertCaptcha({ turnstileToken: 'ts-token', captchaToken: 'rc-token' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  test('When only a reCAPTCHA token is present, then it verifies with reCAPTCHA and never calls Turnstile', async () => {
    mockedVerifyRecaptcha.mockResolvedValue(true);

    await expect(assertCaptcha({ captchaToken: 'rc-token' })).resolves.toBeUndefined();

    expect(mockedVerifyTurnstile).not.toHaveBeenCalled();
    expect(mockedVerifyRecaptcha).toHaveBeenCalledWith('rc-token');
  });

  test('When only a reCAPTCHA token is present and it is invalid, then it rejects with ForbiddenError', async () => {
    mockedVerifyRecaptcha.mockResolvedValue(false);

    await expect(assertCaptcha({ captchaToken: 'rc-token' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
