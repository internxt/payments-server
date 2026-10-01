import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { signGatewayToken } from '../utils/signGatewayToken';
import { AppConfig } from '../config';

export enum PreCreatedUserStatus {
  AwaitingPayment = 'awaiting_payment',
  PendingSetup = 'pending_setup',
  Cancelled = 'cancelled',
}

interface PreCreatedUser {
  uuid: string;
  status: PreCreatedUserStatus;
}

export class AccountSetupService {
  constructor(
    private readonly axios: AxiosInstance,
    private readonly config: AppConfig,
  ) {}

  get gatewaySecret(): string {
    return this.config.DRIVE_NEW_GATEWAY_SECRET;
  }

  get baseUrl(): string {
    return `${this.gatewaySecret}/gateway/users/pre-create`;
  }

  basicRequestConfig(token: string, args?: Partial<AxiosRequestConfig>): AxiosRequestConfig {
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...args,
    };
  }

  async createPreCreatedUser(email: string): Promise<PreCreatedUser> {
    const token = signGatewayToken('5m', this.gatewaySecret);

    const requestConfig: AxiosRequestConfig = this.basicRequestConfig(token);

    return this.axios.post(this.baseUrl, requestConfig);
  }

  async getPreCreatedUser(email: string): Promise<PreCreatedUser> {
    const token = signGatewayToken('5m', this.gatewaySecret);

    const requestConfig: AxiosRequestConfig = this.basicRequestConfig(token, {
      params: {
        email,
      },
    });

    return this.axios.get(this.baseUrl, requestConfig);
  }

  async updatePreCreatedUser(uuid?: string, status?: PreCreatedUserStatus, maxSpaceBytes?: string, tierId?: string) {
    const token = signGatewayToken('5m', this.gatewaySecret);

    const requestConfig: AxiosRequestConfig = this.basicRequestConfig(token);

    return this.axios.patch(
      this.baseUrl,
      {
        uuid,
        status,
        maxSpaceBytes,
      },
      requestConfig,
    );
  }
}
