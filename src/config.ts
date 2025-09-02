import 'dotenv/config';

const mandatoryVariables = [
  'NODE_ENV',
  'SERVER_PORT',
  'MONGO_URI',
  'STORAGE_GATEWAY_SECRET',
  'STORAGE_GATEWAY_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_KEY',
  'JWT_SECRET',
  'DRIVE_GATEWAY_URL',
  'DRIVE_GATEWAY_USER',
  'DRIVE_GATEWAY_PASSWORD',
  'DRIVE_NEW_GATEWAY_URL',
  'DRIVE_NEW_GATEWAY_SECRET',
  'STRIPE_OBJECT_STORAGE_PRICE_ID',
  'OBJECT_STORAGE_GATEWAY_SECRET',
  'OBJECT_STORAGE_URL',
  'CRYPTO_PAYMENTS_PROCESSOR_API_URL',
  'CRYPTO_PAYMENTS_PROCESSOR_SECRET_KEY',
  'CRYPTO_PAYMENTS_PROCESSOR_API_KEY',
  'VPN_URL',
  'PC_CLOUD_TRIAL_CODE',
  'CHART_API_URL',
  'DRIVE_WEB_URL',
  'RECAPTCHA_V3_ENDPOINT',
  'RECAPTCHA_V3_SCORE_THRESHOLD',
  'RECAPTCHA_V3',
] as const;

type BaseConfig = {
  [name in (typeof mandatoryVariables)[number]]: string;
};

interface DevConfig extends BaseConfig {
  NODE_ENV: 'development';
  REDIS_HOST?: string;
}

const mandatoryVariablesOnlyInProd = ['REDIS_HOST', 'REDIS_PASSWORD'] as const;

type ProdConfig = BaseConfig & {
  NODE_ENV: 'production';
} & {
  [name in (typeof mandatoryVariablesOnlyInProd)[number]]: string;
};

const mandatoryVariablesOnlyInTest = ['NODE_ENV', 'SERVER_PORT', 'STRIPE_SECRET_KEY', 'JWT_SECRET'] as const;

export type AppConfig = DevConfig | ProdConfig;

const variablesToCheck =
  process.env.NODE_ENV === 'test'
    ? mandatoryVariablesOnlyInTest
    : [...mandatoryVariables, ...(process.env.NODE_ENV === 'production' ? mandatoryVariablesOnlyInProd : [])];

const undefinedMandatoryVariables = variablesToCheck.filter((key) => !process.env[key]);

if (undefinedMandatoryVariables.length) {
  throw new Error(`Some mandatory variables are undefined: ${undefinedMandatoryVariables.join(' - ')}.`);
}

export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isTest = process.env.NODE_ENV === 'test';

export default process.env as AppConfig;
