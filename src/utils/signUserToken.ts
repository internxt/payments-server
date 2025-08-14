import jwt from 'jsonwebtoken';
import config from '../config';

export function signUserToken(payload: { customerId?: string; invoiceId?: string }): string {
  return jwt.sign(payload, config.JWT_SECRET);
}
