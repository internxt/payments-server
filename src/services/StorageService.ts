import { Axios, AxiosRequestConfig } from 'axios';
import { sign } from 'jsonwebtoken';
import { type AppConfig } from '../config';

function signToken(duration: string, secret: string) {
  return sign({}, Buffer.from(secret, 'base64').toString('utf8'), {
    algorithm: 'RS256',
    expiresIn: duration,
  });
}

export class StorageService {
  public changeStoragePath = 'v2/gateway/storage/users';

  constructor(private readonly config: AppConfig, private readonly axios: Axios) {}

  async changeStorage(uuid: string, newStorageBytes: number): Promise<void> {
    const jwt = signToken('5m', this.config.STORAGE_GATEWAY_SECRET);
    const params: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    await this.axios.put(
      `${this.config.STORAGE_GATEWAY_URL}/${this.changeStoragePath}/${uuid}`,
      { bytes: newStorageBytes },
      params,
    );
  }
}
