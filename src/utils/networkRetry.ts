import axios from 'axios';

const TRANSIENT_NETWORK_ERRORS = new Set(['EAI_AGAIN']);

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
  return !!code && TRANSIENT_NETWORK_ERRORS.has(code);
};
