import { sign } from 'jsonwebtoken';
import { isProduction } from '../config';

export function signGatewayToken(duration: string, secret: string): string {
  return sign({}, Buffer.from(secret, 'base64').toString('utf8'), {
    algorithm: 'RS256',
    expiresIn: duration,
    ...(!isProduction ? { allowInsecureKeySizes: true } : null),
  });
}
