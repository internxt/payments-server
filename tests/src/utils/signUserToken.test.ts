import { loadConfig } from '../../../src/config';
import { signUserToken } from '../../../src/utils/signUserToken';
import jwt from 'jsonwebtoken';

const config = loadConfig();

describe('Signing user token', () => {
  test('When customer Id is provided, then the token is signed with the customer Id', () => {
    const customerId = 'cus_123';
    const token = signUserToken({ customerId }, config.JWT_SECRET);

    const decodedToken = jwt.verify(token, config.JWT_SECRET) as { customerId: string };

    expect(decodedToken.customerId).toBe(customerId);
  });

  test('When a token is signed, then it expires six hours later', () => {
    const token = signUserToken({ customerId: 'cus_123' }, config.JWT_SECRET);

    const { iat, exp } = jwt.verify(token, config.JWT_SECRET) as { iat: number; exp: number };

    expect(exp - iat).toBe(6 * 60 * 60);
  });
});
