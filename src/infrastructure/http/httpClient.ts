import axios, { AxiosInstance, CreateAxiosDefaults, isAxiosError } from 'axios';

import { HttpResponseError } from './HttpResponseError';

/**
 * Creates an axios instance whose failed responses are normalized into
 * {@link HttpResponseError}, so callers read `status`/`code`/`message` directly instead
 * of reaching into `error.response.data`. Errors without a response (network failures)
 * are left untouched.
 */
export function createHttpClient(config?: CreateAxiosDefaults): AxiosInstance {
  const client = axios.create(config);

  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (isAxiosError(error) && error.response) {
        throw HttpResponseError.from(error);
      }

      throw error;
    },
  );

  return client;
}
