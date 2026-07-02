import { PaymentService } from './payment.service';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { type AppConfig } from '../config';
import { signGatewayToken } from '../utils/signGatewayToken';

export class ObjectStorageService {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly config: AppConfig,
    private readonly axios: AxiosInstance,
  ) {}

  async initObjectStorageUser(payload: { email: string; customerId: string }) {
    const { email, customerId } = payload;

    await this.createUser(email, customerId);
  }

  async reactivateAccount(payload: { customerId: string }): Promise<void> {
    const jwt = signGatewayToken('5m', this.config.OBJECT_STORAGE_GATEWAY_SECRET);
    const params: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    await this.axios.put(`${this.config.OBJECT_STORAGE_URL}/users/${payload.customerId}/reactivate`, {}, params);
  }

  async suspendAccount(payload: { customerId: string }): Promise<void> {
    const jwt = signGatewayToken('5m', this.config.OBJECT_STORAGE_GATEWAY_SECRET);
    const params: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    await this.axios.put(`${this.config.OBJECT_STORAGE_URL}/users/${payload.customerId}/deactivate`, {}, params);
  }

  private async createUser(email: string, customerId: string): Promise<void> {
    const jwt = signGatewayToken('5m', this.config.OBJECT_STORAGE_GATEWAY_SECRET);
    const params: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    await this.axios.post(
      `${this.config.OBJECT_STORAGE_URL}/users`,
      {
        email,
        customerId,
      },
      params,
    );
  }
}
