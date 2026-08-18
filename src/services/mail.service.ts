import { AxiosInstance, AxiosRequestConfig, isAxiosError } from 'axios';
import { type AppConfig } from '../config';
import { User } from '../core/users/User';
import Logger from '../Logger';
import { signGatewayToken } from '../utils/signGatewayToken';

export class MailService {
  constructor(
    private readonly config: AppConfig,
    private readonly axios: AxiosInstance,
  ) {}

  async suspendAccount(uuid: User['uuid']): Promise<void> {
    await this.post(`/gateway/accounts/${uuid}/suspend`, uuid);
  }

  async reactivateAccount(uuid: User['uuid']): Promise<void> {
    await this.post(`/gateway/accounts/${uuid}/reactivate`, uuid);
  }

  private async post(path: string, uuid: User['uuid']): Promise<void> {
    try {
      await this.axios.post(`${this.config.MAIL_URL}${path}`, {}, this.requestConfig());
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        Logger.info(`No mail account found for user ${uuid}, skipping ${path}`);
        return;
      }

      throw error;
    }
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
