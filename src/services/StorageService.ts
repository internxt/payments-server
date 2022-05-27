import { Axios, AxiosRequestConfig } from 'axios';
import { sign } from 'jsonwebtoken';

import { ConfigService } from './ConfigService';

function signToken(duration: string, secret: string) {
  return sign(
    {}, 
    Buffer.from(secret, 'base64').toString('utf8'), 
    {
      algorithm: 'RS256',
      expiresIn: duration
    }
  );
}

export class StorageService {
  public changeStoragePath = 'gateway/upgrade';

  constructor(
    private readonly config: ConfigService,
    private readonly axios: Axios
  ) {}

  async changeStorage(email: string, newStorageBytes: number): Promise<void> {  
    const jwt = signToken('5m', this.config.getEnvironment().STORAGE_GATEWAY_SECRET);
    const params: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`
      },
      data: { email, bytes: newStorageBytes }
    };

    await this.axios.post(
      `${this.config.getEnvironment().STORAGE_GATEWAY_URL}/${this.changeStoragePath}`, 
      params
    );
  }
}
