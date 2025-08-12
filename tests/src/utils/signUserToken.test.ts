import config from '../../../src/config';
import { signUserToken } from '../../../src/utils/signUserToken';
import jwt from 'jsonwebtoken';

describe('Signing user token', () => {
  test('When customer Id is provided, then the token is signed with the customer Id', () => {
    const customerId = 'cus_123';
    const token = signUserToken({ customerId });

    const decodedToken = jwt.verify(token, config.JWT_SECRET) as { customerId: string };

    expect(decodedToken.customerId).toBe(customerId);
  });

  test('When invoice Id is provided, then the token is signed with the invoice Id', () => {
    const invoiceId = 'in_123';
    const token = signUserToken({ invoiceId });

    const decodedToken = jwt.verify(token, config.JWT_SECRET) as { invoiceId: string };

    expect(decodedToken.invoiceId).toBe(invoiceId);
  });
});
