import jwt from 'jsonwebtoken';
import config from '../config';
import { PAYMENTS_TOKEN_EXPIRATION } from '../constants';

export function signUserToken(payload: { customerId?: string; invoiceId?: string }): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: PAYMENTS_TOKEN_EXPIRATION });
}
