import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import {
  getConfirmationToken,
  getCustomer,
  getExpiredAuthToken,
  getValidAuthToken,
  getValidUserToken,
} from '../fixtures';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { UsersService } from '../../../src/services/users.service';
import { PaymentService } from '../../../src/services/payment.service';
import * as verifyRecaptcha from '../../../src/utils/verifyRecaptcha';
import { stripePaymentsAdapter } from '../../../src/infrastructure/adapters/stripe.adapter';
import { DriveAccountAlreadyExistsError } from '../../../src/errors/PaymentErrors';

jest.mock('ioredis', () => require('ioredis-mock'));

const nowInSeconds = () => Math.floor(Date.now() / 1000);

const drivePreCreatesUser = ({ uuid = randomUUID(), setupPending = false } = {}) => {
  const preCreate = jest.spyOn(UsersService.prototype, 'preCreateUser').mockResolvedValue({ uuid, setupPending });
  return { uuid, preCreate };
};

const driveHasRegisteredUser = () =>
  jest.spyOn(UsersService.prototype, 'preCreateUser').mockRejectedValue(new DriveAccountAlreadyExistsError());

const stripeHasConfirmationToken = (params?: Partial<Stripe.ConfirmationToken>) => {
  const confirmationToken = getConfirmationToken(params);
  jest
    .spyOn(stripePaymentsAdapter.provider.confirmationTokens, 'retrieve')
    .mockResolvedValue(confirmationToken as Stripe.Response<Stripe.ConfirmationToken>);
  return confirmationToken;
};

const stripeCreatesCustomers = () =>
  jest.spyOn(stripePaymentsAdapter.provider.customers, 'create').mockImplementation(async (params) => {
    const { email, metadata } = params as Stripe.CustomerCreateParams;
    return getCustomer({ email, metadata: metadata as Stripe.Metadata }) as Stripe.Response<Stripe.Customer>;
  });

let app: FastifyInstance;

beforeAll(async () => {
  jest.spyOn(stripePaymentsAdapter, 'syncTaxRegistrations').mockResolvedValue();
  app = await initializeServerAndDatabase();
});

afterAll(async () => {
  await closeServerAndDatabase();
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(true);
});

describe('Buying a plan without an account', () => {
  describe('Preparing the customer', () => {
    const billingDetails = {
      customerName: 'Jane Doe',
      lineAddress1: 'Street 123',
      city: 'Barcelona',
      country: 'ES',
      postalCode: '08001',
      captchaToken: 'valid_captcha_token',
    };
    const newBuyerEmail = () => `new.buyer.${randomUUID()}@internxt.com`;

    const prepareCustomer = (body: Record<string, unknown>) =>
      app.inject({ path: '/checkout/customer', method: 'POST', body });

    test('When a new buyer starts paying, then the customer is created for the pre-created Drive user and returned with its payment token', async () => {
      const email = newBuyerEmail();
      const confirmationToken = stripeHasConfirmationToken();
      const { uuid, preCreate } = drivePreCreatesUser();
      const createCustomer = stripeCreatesCustomers();

      const response = await prepareCustomer({
        ...billingDetails,
        metadata: { cello_ucc: 'referral-code' },
        email,
        confirmationTokenId: confirmationToken.id,
      });

      const { customerId, token } = response.json();
      expect(response.statusCode).toBe(200);
      expect(token).toBe(getValidUserToken({ customerId }));
      expect(preCreate).toHaveBeenCalledWith(email);
      expect(createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          email,
          name: billingDetails.customerName,
          address: expect.objectContaining({ country: 'ES', postal_code: '08001', city: 'Barcelona' }),
          metadata: { cello_ucc: 'referral-code', new_user_id: uuid },
        }),
      );
    });

    test('When the email is typed with capital letters, then Drive and the customer receive it in lowercase', async () => {
      const email = newBuyerEmail();
      const { preCreate } = drivePreCreatesUser();
      const createCustomer = stripeCreatesCustomers();

      const response = await prepareCustomer({
        ...billingDetails,
        email: email.toUpperCase(),
        confirmationTokenId: stripeHasConfirmationToken().id,
      });

      expect(response.statusCode).toBe(200);
      expect(preCreate).toHaveBeenCalledWith(email);
      expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ email }));
    });

    test('When a VAT id is provided, then it is attached to the customer', async () => {
      drivePreCreatesUser();
      stripeCreatesCustomers();
      const attachVatId = jest.spyOn(PaymentService.prototype, 'getVatIdAndAttachTaxIdToCustomer').mockResolvedValue();

      const response = await prepareCustomer({
        ...billingDetails,
        companyVatId: 'ESB12345678',
        email: newBuyerEmail(),
        confirmationTokenId: stripeHasConfirmationToken().id,
      });

      expect(response.statusCode).toBe(200);
      expect(attachVatId).toHaveBeenCalledWith(response.json().customerId, 'ES', 'ESB12345678');
    });

    test('When the email belongs to a registered Drive user, then the buyer is told to log in and no customer is created', async () => {
      driveHasRegisteredUser();
      const createCustomer = stripeCreatesCustomers();

      const response = await prepareCustomer({
        ...billingDetails,
        email: newBuyerEmail(),
        confirmationTokenId: stripeHasConfirmationToken().id,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBeUndefined();
      expect(createCustomer).not.toHaveBeenCalled();
    });

    test('When the email already paid a plan whose account setup is pending, then the buyer is told to finish the setup and no customer is created', async () => {
      drivePreCreatesUser({ setupPending: true });
      const createCustomer = stripeCreatesCustomers();

      const response = await prepareCustomer({
        ...billingDetails,
        email: newBuyerEmail(),
        confirmationTokenId: stripeHasConfirmationToken().id,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toStrictEqual({
        message: 'The account setup is pending, check your email to complete it',
        code: 'AccountSetupPending',
      });
      expect(createCustomer).not.toHaveBeenCalled();
    });

    test('When the payment confirmation is not valid, then it is rejected and nothing is created', async () => {
      const confirmationToken = stripeHasConfirmationToken({ expires_at: nowInSeconds() - 1 });
      const { preCreate } = drivePreCreatesUser();
      const createCustomer = stripeCreatesCustomers();

      const response = await prepareCustomer({
        ...billingDetails,
        email: newBuyerEmail(),
        confirmationTokenId: confirmationToken.id,
      });

      expect(response.statusCode).toBe(403);
      expect(preCreate).not.toHaveBeenCalled();
      expect(createCustomer).not.toHaveBeenCalled();
    });

    test.each([
      ['the email', { confirmationTokenId: 'ctoken_123' }],
      ['the payment confirmation', { email: 'new.buyer@internxt.com' }],
    ])('When %s is missing, then the request is rejected as invalid', async (_, missingOne) => {
      const createCustomer = stripeCreatesCustomers();

      const response = await prepareCustomer({ ...billingDetails, ...missingOne });

      expect(response.statusCode).toBe(400);
      expect(createCustomer).not.toHaveBeenCalled();
    });

    test('When the email is not valid, then the request is rejected as invalid', async () => {
      const response = await prepareCustomer({
        ...billingDetails,
        email: 'not-an-email',
        confirmationTokenId: 'ctoken_123',
      });

      expect(response.statusCode).toBe(400);
    });

    test('When the captcha fails, then the request is rejected before the payment confirmation is used', async () => {
      jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(false);
      const retrieveConfirmation = jest.spyOn(stripePaymentsAdapter.provider.confirmationTokens, 'retrieve');
      const preCreate = jest.spyOn(UsersService.prototype, 'preCreateUser');

      const response = await prepareCustomer({
        ...billingDetails,
        email: newBuyerEmail(),
        confirmationTokenId: 'ctoken_123',
      });

      expect(response.statusCode).toBe(403);
      expect(retrieveConfirmation).not.toHaveBeenCalled();
      expect(preCreate).not.toHaveBeenCalled();
    });

    test('When the buyer is logged in, then no payment confirmation nor Drive pre-creation is needed and the customer is linked to the Drive user', async () => {
      const driveUserUuid = randomUUID();
      const email = newBuyerEmail();
      const createCustomer = stripeCreatesCustomers();
      const linkCustomerToDriveUser = jest.spyOn(UsersService.prototype, 'insertUser');
      const retrieveConfirmation = jest.spyOn(stripePaymentsAdapter.provider.confirmationTokens, 'retrieve');
      const preCreate = jest.spyOn(UsersService.prototype, 'preCreateUser');

      const response = await app.inject({
        path: '/checkout/customer',
        method: 'POST',
        body: billingDetails,
        headers: { authorization: `Bearer ${getValidAuthToken(driveUserUuid, undefined, { email })}` },
      });

      expect(response.statusCode).toBe(200);
      expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ email }));
      expect(linkCustomerToDriveUser).toHaveBeenCalledWith({
        customerId: response.json().customerId,
        uuid: driveUserUuid,
        lifetime: false,
      });
      expect(retrieveConfirmation).not.toHaveBeenCalled();
      expect(preCreate).not.toHaveBeenCalled();
    });

    test.each([
      ['has expired', () => `Bearer ${getExpiredAuthToken(randomUUID())}`],
      ['is not a valid token', () => 'Bearer invalid_token'],
    ])('When the buyer sends a login that %s, then it is rejected and nothing is created', async (_, authorization) => {
      const { preCreate } = drivePreCreatesUser();
      const createCustomer = stripeCreatesCustomers();
      const retrieveConfirmation = jest.spyOn(stripePaymentsAdapter.provider.confirmationTokens, 'retrieve');

      const response = await app.inject({
        path: '/checkout/customer',
        method: 'POST',
        body: { ...billingDetails, email: newBuyerEmail(), confirmationTokenId: 'ctoken_123' },
        headers: { authorization: authorization() },
      });

      expect(response.statusCode).toBe(401);
      expect(preCreate).not.toHaveBeenCalled();
      expect(createCustomer).not.toHaveBeenCalled();
      expect(retrieveConfirmation).not.toHaveBeenCalled();
    });
  });
});
