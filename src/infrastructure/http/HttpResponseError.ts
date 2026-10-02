import { AxiosError } from 'axios';

interface ErrorResponseBody {
  code?: string;
  message?: string;
}

/**
 * A failed HTTP response with the fields we care about flattened out, so callers read
 * `status`, `code` and `message` instead of digging into the axios error shape.
 *
 * Only responses are normalized: requests that never got one (timeouts, DNS failures,
 * connection refused) keep propagating as the original axios error.
 */
export class HttpResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
    readonly body: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, HttpResponseError.prototype);
  }

  static from(error: AxiosError): HttpResponseError {
    const response = error.response!;
    const body = response.data as ErrorResponseBody | undefined;

    return new HttpResponseError(body?.message ?? error.message, response.status, body?.code, response.data);
  }

  hasCode(code: string): boolean {
    return this.code === code;
  }
}
