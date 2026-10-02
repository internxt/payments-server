import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { signGatewayToken } from '../utils/signGatewayToken';
import { AppConfig } from '../config';
import { PreCreatedUser, PreCreatedUserStatus } from '../infrastructure/domain/entities/preCreatedUser';
import { PreCreatedUserNotFoundError, PreCreatedUserPendingSetupError } from '../errors/PreCreatedUsersErrors';
import { HttpResponseError } from '../infrastructure/http/HttpResponseError';
import { HttpErrorCode } from '../errors/httpErrorCodes';

export class PreCreatedUserService {
  constructor(
    private readonly axios: AxiosInstance,
    private readonly config: AppConfig,
  ) {}

  async create(email: string): Promise<PreCreatedUser> {
    const token = signGatewayToken('5m', this.gatewaySecret);

    const requestConfig: AxiosRequestConfig = this.basicRequestConfig(token);

    const preCreatedUser = await this.axios.post(`${this.baseUrl}/pre-create`, { email }, requestConfig);

    return PreCreatedUser.toDomain(preCreatedUser.data);
  }

  /**
   * @throws {PreCreatedUserNotFoundError} When the gateway has no pre-created user for that email.
   */
  async get(email: string): Promise<PreCreatedUser> {
    const token = signGatewayToken('5m', this.gatewaySecret);

    const requestConfig: AxiosRequestConfig = this.basicRequestConfig(token, {
      params: {
        email,
      },
    });

    try {
      const preCreatedUser = await this.axios.get(`${this.baseUrl}/pre-create`, requestConfig);

      return PreCreatedUser.toDomain(preCreatedUser.data);
    } catch (error) {
      if (error instanceof HttpResponseError && error.hasCode(HttpErrorCode.UserNotFound)) {
        throw new PreCreatedUserNotFoundError();
      }

      throw error;
    }
  }

  async update({
    uuid,
    status,
    maxSpaceBytes,
    tierId,
  }: {
    uuid?: string;
    status?: PreCreatedUserStatus;
    maxSpaceBytes?: string;
    tierId?: string;
  }): Promise<void> {
    const token = signGatewayToken('5m', this.gatewaySecret);

    const requestConfig: AxiosRequestConfig = this.basicRequestConfig(token);

    await this.axios.patch(
      `${this.baseUrl}/pre-create`,
      {
        uuid,
        status,
        maxSpaceBytes,
        tierId,
      },
      requestConfig,
    );
  }

  async sendSetupEmail(uuid: string, planName?: string): Promise<void> {
    const token = signGatewayToken('5m', this.gatewaySecret);

    const requestConfig: AxiosRequestConfig = this.basicRequestConfig(token);

    await this.axios.post(
      `${this.baseUrl}/${uuid}/setup-email`,
      {
        planName,
      },
      requestConfig,
    );
  }

  async getOrCreate(email: string): Promise<PreCreatedUser> {
    const existingPreCreatedUser = await this.get(email).catch((error) => {
      if (error instanceof PreCreatedUserNotFoundError) {
        return null;
      }

      throw error;
    });

    return existingPreCreatedUser ?? this.create(email);
  }

  /**
   * @throws {PreCreatedUserNotFoundError} When the gateway has no pre-created user for that email.
   * @throws {PreCreatedUserPendingSetupError} When the user already paid and is pending to set up the account.
   */
  async getEligibleForPayment(email: string): Promise<PreCreatedUser> {
    const preCreatedUser = await this.get(email);

    if (preCreatedUser.isPendingStatus) {
      throw new PreCreatedUserPendingSetupError();
    }

    return preCreatedUser;
  }

  private get gatewaySecret(): string {
    return this.config.DRIVE_NEW_GATEWAY_SECRET;
  }

  private get apiHostname(): string {
    return this.config.DRIVE_NEW_GATEWAY_URL;
  }

  private get baseUrl(): string {
    return `${this.apiHostname}/gateway/users`;
  }

  private basicRequestConfig(token: string, args?: Partial<AxiosRequestConfig>): AxiosRequestConfig {
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...args,
    };
  }
}
