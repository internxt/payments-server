import axios from 'axios';

const TRANSIENT_NETWORK_ERRORS = ['EAI_AGAIN'];

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getNetworkErrorCode = (err: unknown): string | undefined => {
  if (!axios.isAxiosError(err)) {
    return undefined;
  }

  const cause = err.cause as { code?: string } | undefined;
  return err.code ?? cause?.code;
};

export const isTransientNetworkError = (err: unknown): boolean => {
  const code = getNetworkErrorCode(err);
  return !!code && TRANSIENT_NETWORK_ERRORS.includes(code);
};
