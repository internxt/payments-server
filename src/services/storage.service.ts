import axios, { Axios, AxiosRequestConfig } from 'axios';
import { sign } from 'jsonwebtoken';
import { type AppConfig } from '../config';
import { User } from '../core/users/User';

function signToken(duration: string, secret: string) {
  return sign({}, Buffer.from(secret, 'base64').toString('utf8'), {
    algorithm: 'RS256',
    expiresIn: duration,
  });
}

export class StorageService {
  public changeStoragePath = 'v2/gateway/storage/users';

  constructor(
    private readonly config: AppConfig,
    private readonly axios: Axios,
  ) {}

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

export async function createOrUpdateUser(maxSpaceBytes: string, email: string, config: AppConfig) {
  return axios.post(
    `${config.DRIVE_GATEWAY_URL}/api/gateway/user/updateOrCreate`,
    { maxSpaceBytes, email },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      auth: { username: config.DRIVE_GATEWAY_USER, password: config.DRIVE_GATEWAY_PASSWORD },
    },
  );
}

export async function updateUserTier(uuid: string, planId: string, config: AppConfig) {
  return axios.put(
    `${config.DRIVE_GATEWAY_URL}/api/gateway/user/update/tier`,
    { planId, uuid },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      auth: { username: config.DRIVE_GATEWAY_USER, password: config.DRIVE_GATEWAY_PASSWORD },
    },
  );
}

export async function getUserStorage(
  userUuid: User['uuid'],
  email: string,
  newStorage: string,
  config: AppConfig,
): Promise<{
  canExpand: boolean;
  currentMaxSpaceBytes: number;
  expandableBytes: number;
}> {
  const jwt = signToken('5m', config.DRIVE_NEW_GATEWAY_SECRET);
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
