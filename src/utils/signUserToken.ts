import jwt from 'jsonwebtoken';
import { PAYMENTS_TOKEN_EXPIRATION } from '../constants';

export function signUserToken(payload: { customerId: string }, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: PAYMENTS_TOKEN_EXPIRATION });
}
