import { PaymentService } from './PaymentService';
import { sign } from 'jsonwebtoken';
import { Axios, AxiosRequestConfig } from 'axios';
import { type AppConfig } from '../config';

function signToken(duration: string, secret: string) {
  return sign({}, Buffer.from(secret, 'base64').toString('utf8'), {
    algorithm: 'RS256',
    expiresIn: duration,
  });
}

export class ObjectStorageService {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly config: AppConfig,
    private readonly axios: Axios,
  ) {}

  async initObjectStorageUser(payload: {
    email: string;
    customerId: string,
    currency: string
  }) {
    const { email, customerId, currency } = payload;

    await this.paymentService.createSubscription(
      customerId, 
      this.config.STRIPE_OBJECT_STORAGE_PRICE_ID, 
      currency
    );
    await this.createUser(email, customerId);
  }

  private async createUser(
    email: string,
    customerId: string
  ): Promise<void> {
    const jwt = signToken('5m', this.config.OBJECT_STORAGE_GATEWAY_SECRET);
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
        customerId
      },
      params,
    );
  }

}
