import 'dotenv/config';

const BASE_REQUIRED_VARIABLES = [
  'NODE_ENV',
  'SERVER_PORT',
  'MONGO_URI',
  // 'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_KEY',
  'JWT_SECRET',
  'DRIVE_NEW_GATEWAY_URL',
  'DRIVE_NEW_GATEWAY_SECRET',
  'PAYMENTS_GATEWAY_PUBLIC_SECRET',
  'STRIPE_OBJECT_STORAGE_PRICE_ID',
  'OBJECT_STORAGE_GATEWAY_SECRET',
  'OBJECT_STORAGE_URL',
  'MAIL_URL',
  'MAIL_GATEWAY_SECRET',
  'VPN_URL',
  'CHART_API_URL',
  'DRIVE_WEB_URL',
  'RECAPTCHA_V3_ENDPOINT',
  'RECAPTCHA_V3_SCORE_THRESHOLD',
  'RECAPTCHA_V3',
  'REDIS_HOST',
  'REDIS_PASSWORD',
] as const;

const TEST_REQUIRED_VARIABLES = [
  'NODE_ENV',
  'SERVER_PORT',
  'STRIPE_SECRET_KEY',
  'JWT_SECRET',
  'PAYMENTS_GATEWAY_SECRET',
  'CHART_API_URL',
  'DRIVE_NEW_GATEWAY_URL',
] as const;

type RequiredVariable = (typeof BASE_REQUIRED_VARIABLES)[number] | (typeof TEST_REQUIRED_VARIABLES)[number];

type EnvVariables = Record<RequiredVariable, string> & {
  KLAVIYO_API_KEY?: string;
  KLAVIYO_BASE_URL?: string;
};

export type AppConfig = EnvVariables & {
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
};

/**
 * Reads the environment, checks that the mandatory variables are set and returns the app config.
 *
 * @throws {Error} When a mandatory variable is undefined.
 */
export function loadConfig(): AppConfig {
  const { NODE_ENV } = process.env;
  const variablesToCheck = NODE_ENV === 'test' ? TEST_REQUIRED_VARIABLES : BASE_REQUIRED_VARIABLES;
  const undefinedMandatoryVariables = variablesToCheck.filter((key) => !process.env[key]);

  if (undefinedMandatoryVariables.length) {
    throw new Error(`Some mandatory variables are undefined: ${undefinedMandatoryVariables.join(' - ')}.`);
  }

  return {
    ...(process.env as EnvVariables),
    isProduction: NODE_ENV === 'production',
    isDevelopment: NODE_ENV === 'development',
    isTest: NODE_ENV === 'test',
  };
}

// Only for the Logger singleton, which gets the config injected in the logger block.
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isTest = process.env.NODE_ENV === 'test';
