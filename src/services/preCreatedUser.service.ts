import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { signGatewayToken } from '../utils/signGatewayToken';
import { AppConfig } from '../config';
import { PreCreatedUser, PreCreatedUserStatus } from '../infrastructure/domain/entities/preCreatedUser';
import { PreCreatedUserNotFoundError, PreCreatedUserPendingSetupError } from '../errors/PreCreatedUsersErrors';

export class PreCreatedUserService {
  constructor(
    private readonly axios: AxiosInstance,
    private readonly config: AppConfig,
  ) {}

  async create(email: string): Promise<PreCreatedUser> {
    const token = signGatewayToken('5m', this.gatewaySecret);

    const requestConfig: AxiosRequestConfig = this.basicRequestConfig(token);

    const preCreatedUser = await this.axios.post(this.baseUrl, { email }, requestConfig);

    return PreCreatedUser.toDomain(preCreatedUser.data);
  }

  async get(email: string): Promise<PreCreatedUser> {
    const token = signGatewayToken('5m', this.gatewaySecret);

    const requestConfig: AxiosRequestConfig = this.basicRequestConfig(token, {
      params: {
        email,
      },
    });

    const preCreatedUser = await this.axios.get(this.baseUrl, requestConfig);

    return PreCreatedUser.toDomain(preCreatedUser.data);
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
      this.baseUrl,
      {
        uuid,
        status,
        maxSpaceBytes,
        tierId,
      },
      requestConfig,
    );
  }

  async getOrCreate(email: string) {
    const existsPreCreatedUser = await this.get(email).catch((error) => {
      if (error.response.data.code === 'USER_NOT_FOUND') {
        return null;
      }

      throw error;
    });

    if (!existsPreCreatedUser) {
      return await this.create(email);
    }

    return existsPreCreatedUser;
  }

  async getEligibleForPayment(email: string) {
    const preCreatedUser = await this.get(email).catch((error) => {
      if (error.response.data.code === 'USER_NOT_FOUND') {
        throw new PreCreatedUserNotFoundError();
      }

      throw error;
    });

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
    return `${this.apiHostname}/gateway/users/pre-create`;
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
