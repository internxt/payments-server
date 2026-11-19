import axios, { AxiosInstance, AxiosRequestConfig, isAxiosError } from 'axios';
import { sign } from 'jsonwebtoken';
import { type AppConfig } from '../config';
import { User } from '../core/users/User';
import Logger from '../Logger';

function signToken(duration: string, secret: string, isProduction: boolean) {
  return sign({}, Buffer.from(secret, 'base64').toString('utf8'), {
    algorithm: 'RS256',
    expiresIn: duration,
    ...(!isProduction ? { allowInsecureKeySizes: true } : null),
  });
}

export class StorageService {
  constructor(
    private readonly config: AppConfig,
    private readonly axios: AxiosInstance,
  ) {}

  async updateUserStorageAndTier(uuid: string, newStorageBytes: number, foreignTierId: string): Promise<void> {
    const jwt = signToken('5m', this.config.DRIVE_NEW_GATEWAY_SECRET, this.config.isProduction);
    const params: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    try {
      await this.axios.patch(
        `${this.config.DRIVE_NEW_GATEWAY_URL}/gateway/users/${uuid}`,
        { maxSpaceBytes: newStorageBytes, tierId: foreignTierId },
        params,
      );
    } catch (error) {
      let errorMessage = error;

      if (isAxiosError(error)) {
        errorMessage = error.response?.data;
      }

      Logger.error(`ERROR CHANGING STORAGE: ${JSON.stringify(errorMessage)}`);
      throw error;
    }
  }
}

export async function getUserStorage(
  userUuid: User['uuid'],
  email: string,
  newStorage: string,
  config: Pick<AppConfig, 'DRIVE_NEW_GATEWAY_SECRET' | 'DRIVE_NEW_GATEWAY_URL' | 'isProduction'>,
): Promise<{
  canExpand: boolean;
  currentMaxSpaceBytes: number;
  expandableBytes: number;
}> {
  const jwt = signToken('5m', config.DRIVE_NEW_GATEWAY_SECRET, config.isProduction);
  const requestConfig: AxiosRequestConfig = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    params: {
      userUuid,
      email,
      additionalBytes: newStorage,
    },
  };

  const stackability = await axios.get(
    `${config.DRIVE_NEW_GATEWAY_URL}/gateway/users/storage/stackability`,
    requestConfig,
  );

  return stackability.data;
}
