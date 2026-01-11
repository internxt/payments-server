import { sign } from 'jsonwebtoken';
import axios, { AxiosRequestConfig } from 'axios';
import config from '../config';

function signToken(duration: string, secret: string) {
  return sign({}, Buffer.from(secret, 'base64').toString('utf8'), {
    algorithm: 'RS256',
    expiresIn: duration,
  });
}

export class ObjectStorageService {
  constructor() {}

  async initObjectStorageUser(payload: { email: string; customerId: string }) {
    const { email, customerId } = payload;

    await this.createUser(email, customerId);
  }

  async reactivateAccount(payload: { customerId: string }): Promise<void> {
    const jwt = signToken('5m', config.OBJECT_STORAGE_GATEWAY_SECRET);
    const params: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    await axios.put(`${config.OBJECT_STORAGE_URL}/users/${payload.customerId}/reactivate`, {}, params);
  }

  async suspendAccount(payload: { customerId: string }): Promise<void> {
    const jwt = signToken('5m', config.OBJECT_STORAGE_GATEWAY_SECRET);
    const params: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    await axios.put(`${config.OBJECT_STORAGE_URL}/users/${payload.customerId}/deactivate`, {}, params);
  }

  async deleteAccount(payload: { customerId: string }): Promise<void> {
    const jwt = signToken('5m', config.OBJECT_STORAGE_GATEWAY_SECRET);
    const params: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    await axios.delete(`${config.OBJECT_STORAGE_URL}/users/${payload.customerId}`, params);
  }

  private async createUser(email: string, customerId: string): Promise<void> {
    const jwt = signToken('5m', config.OBJECT_STORAGE_GATEWAY_SECRET);
    const params: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    };

    await axios.post(
      `${config.OBJECT_STORAGE_URL}/users`,
      {
        email,
        customerId,
      },
      params,
    );
  }
}

export const objectStorageService = new ObjectStorageService();
