import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { type AppConfig } from '../config';
import { User } from '../core/users/User';
import { signGatewayToken } from '../utils/signGatewayToken';

export class MailService {
  constructor(
    private readonly config: AppConfig,
    private readonly axios: AxiosInstance,
  ) {}

  async suspendAccount(uuid: User['uuid']): Promise<void> {
    await this.axios.post(`${this.config.MAIL_URL}/gateway/accounts/${uuid}/suspend`, {}, this.requestConfig());
  }

  async reactivateAccount(uuid: User['uuid']): Promise<void> {
    await this.axios.post(`${this.config.MAIL_URL}/gateway/accounts/${uuid}/reactivate`, {}, this.requestConfig());
  }

  private requestConfig(): AxiosRequestConfig {
    const jwt = signGatewayToken('5m', this.config.MAIL_GATEWAY_SECRET);

    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };
  }
}
