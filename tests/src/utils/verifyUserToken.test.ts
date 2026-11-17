import jwt from 'jsonwebtoken';
import config from '../../../src/config';
import { ForbiddenError } from '../../../src/errors/Errors';
import { verifyUserToken } from '../../../src/utils/verifyUserToken';
import { getExpiredUserToken, getValidUserToken } from '../fixtures';

describe('Verifying the payments token of a customer', () => {
  test('When the token was issued for that customer, then it is accepted', () => {
    const token = getValidUserToken({ customerId: 'cus_123' });

    expect(() => verifyUserToken(token, 'cus_123')).not.toThrow();
  });

  test('When the token was issued for another customer, then it is rejected', () => {
    const token = getValidUserToken({ customerId: 'cus_other' });

    expect(() => verifyUserToken(token, 'cus_123')).toThrow(ForbiddenError);
  });

  test('When the token has expired, then it is rejected', () => {
    const token = getExpiredUserToken({ customerId: 'cus_123' });

    expect(() => verifyUserToken(token, 'cus_123')).toThrow(ForbiddenError);
  });

  test('When the token was signed with another secret, then it is rejected', () => {
    const token = jwt.sign({ customerId: 'cus_123' }, `${config.JWT_SECRET}-other`);

    expect(() => verifyUserToken(token, 'cus_123')).toThrow(ForbiddenError);
  });

  test('When the token has no customer, then it is rejected', () => {
    const token = getValidUserToken({ invoiceId: 'in_123' });

    expect(() => verifyUserToken(token, 'cus_123')).toThrow(ForbiddenError);
  });

  test('When the token is not a valid token, then it is rejected', () => {
    expect(() => verifyUserToken('not-a-token', 'cus_123')).toThrow(ForbiddenError);
  });
});
