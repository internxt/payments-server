import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import {
  getConfirmationToken,
  getCreateSubscriptionResponse,
  getCustomer,
  getExpiredUserToken,
  getValidAuthToken,
  getValidUserToken,
} from '../fixtures';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { UsersService } from '../../../src/services/users.service';
import { PaymentService } from '../../../src/services/payment.service';
import { PaymentIntent } from '../../../src/types/payment';
import { fetchUserStorage } from '../../../src/utils/fetchUserStorage';
import * as verifyRecaptcha from '../../../src/utils/verifyRecaptcha';
import { stripePaymentsAdapter, StripePaymentsAdapter } from '../../../src/infrastructure/adapters/stripe.adapter';
import { UserType } from '../../../src/core/users/User';
import { getPriceEntity } from '../entity.fixtures';
import { DriveAccountAlreadyExistsError } from '../../../src/errors/PaymentErrors';

jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../../../src/utils/fetchUserStorage');

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
  jest.spyOn(StripePaymentsAdapter.prototype, 'shouldCalculateTaxForCustomer').mockResolvedValue(false);
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
  });

  describe('Starting a subscription', () => {
    const customerId = 'cus_without_account';

    const startSubscription = (token: string) =>
      app.inject({
        path: '/checkout/subscription',
        method: 'POST',
        body: { customerId, priceId: 'price_id', token, captchaToken: 'captcha_token' },
      });

    test('When the buyer has the payment token of the customer, then the subscription is created', async () => {
      const subscriptionAttempt = getCreateSubscriptionResponse();
      jest
        .spyOn(StripePaymentsAdapter.prototype, 'getPriceById')
        .mockResolvedValue(getPriceEntity({ type: UserType.Individual }));
      jest.spyOn(PaymentService.prototype, 'createSubscription').mockResolvedValue(subscriptionAttempt);

      const response = await startSubscription(getValidUserToken({ customerId }));

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual(subscriptionAttempt);
    });

    test.each([
      ['is malformed', () => 'malformed.token.payload'],
      ['belongs to another customer', () => getValidUserToken({ customerId: 'cus_someone_else' })],
      ['has expired', () => getExpiredUserToken({ customerId })],
    ])('When the payment token %s, then the subscription is rejected', async (_, token) => {
      const createSubscription = jest.spyOn(PaymentService.prototype, 'createSubscription');

      const response = await startSubscription(token());

      expect(response.statusCode).toBe(403);
      expect(createSubscription).not.toHaveBeenCalled();
    });
  });

  describe('Paying a one-time plan', () => {
    const email = 'new.buyer@internxt.com';
    const lifetimePrice = getPriceEntity({ interval: 'lifetime' });
    const paymentIntent: PaymentIntent = { id: 'payment_intent_id', clientSecret: 'client_secret', type: 'fiat' };

    const payOneTimePlan = ({
      customerId,
      token,
      currency = 'eur',
    }: {
      customerId: string;
      token: string;
      currency?: string;
    }) =>
      app.inject({
        path: '/checkout/payment-intent',
        method: 'POST',
        body: { customerId, priceId: lifetimePrice.id, token, currency, captchaToken: 'captcha_token' },
      });

    beforeEach(() => {
      jest.spyOn(StripePaymentsAdapter.prototype, 'getPriceById').mockResolvedValue(lifetimePrice);
    });

    test('When the buyer has the payment token of the customer, then the invoice is created for the customer email', async () => {
      const customer = getCustomer({ email });
      jest
        .spyOn(stripePaymentsAdapter.provider.customers, 'retrieve')
        .mockResolvedValue(customer as Stripe.Response<Stripe.Customer>);
      const { preCreate } = drivePreCreatesUser();
      const createInvoice = jest.spyOn(PaymentService.prototype, 'createInvoice').mockResolvedValue(paymentIntent);

      const response = await payOneTimePlan({
        customerId: customer.id,
        token: getValidUserToken({ customerId: customer.id }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual(paymentIntent);
      expect(createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: customer.id, userEmail: email }),
      );
      expect(fetchUserStorage).not.toHaveBeenCalled();
      expect(preCreate).toHaveBeenCalledWith(email);
    });

    test('When the customer email already has a Drive account, then the buyer is told to log in', async () => {
      const customer = getCustomer({ email });
      jest
        .spyOn(stripePaymentsAdapter.provider.customers, 'retrieve')
        .mockResolvedValue(customer as Stripe.Response<Stripe.Customer>);
      driveHasRegisteredUser();
      const createInvoice = jest.spyOn(PaymentService.prototype, 'createInvoice');

      const response = await payOneTimePlan({
        customerId: customer.id,
        token: getValidUserToken({ customerId: customer.id }),
      });

      expect(response.statusCode).toBe(409);
      expect(createInvoice).not.toHaveBeenCalled();
    });

    test('When the customer email already paid a plan whose account setup is pending, then the buyer is told to finish the setup', async () => {
      const customer = getCustomer({ email });
      jest
        .spyOn(stripePaymentsAdapter.provider.customers, 'retrieve')
        .mockResolvedValue(customer as Stripe.Response<Stripe.Customer>);
      drivePreCreatesUser({ setupPending: true });
      const createInvoice = jest.spyOn(PaymentService.prototype, 'createInvoice');

      const response = await payOneTimePlan({
        customerId: customer.id,
        token: getValidUserToken({ customerId: customer.id }),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('AccountSetupPending');
      expect(createInvoice).not.toHaveBeenCalled();
    });

    test('When the buyer wants to pay with crypto currencies, then a logged in user is required', async () => {
      const customerId = 'cus_without_account';
      const createInvoice = jest.spyOn(PaymentService.prototype, 'createInvoice');

      const response = await payOneTimePlan({
        customerId,
        token: getValidUserToken({ customerId }),
        currency: 'btc',
      });

      expect(response.statusCode).toBe(401);
      expect(createInvoice).not.toHaveBeenCalled();
    });

    test.each([
      ['is malformed', () => 'malformed.token.payload'],
      ['belongs to another customer', () => getValidUserToken({ customerId: 'cus_someone_else' })],
      ['has expired', () => getExpiredUserToken({ customerId: 'cus_without_account' })],
    ])('When the payment token %s, then the payment is rejected', async (_, token) => {
      const createInvoice = jest.spyOn(PaymentService.prototype, 'createInvoice');

      const response = await payOneTimePlan({ customerId: 'cus_without_account', token: token() });

      expect(response.statusCode).toBe(403);
      expect(createInvoice).not.toHaveBeenCalled();
    });

    test('When the buyer is logged in, then the storage limit of the Drive user is still checked', async () => {
      const customerId = 'cus_logged_in';
      (fetchUserStorage as jest.Mock).mockResolvedValue({ canExpand: false });
      const createInvoice = jest.spyOn(PaymentService.prototype, 'createInvoice');

      const response = await app.inject({
        path: '/checkout/payment-intent',
        method: 'POST',
        body: {
          customerId,
          priceId: lifetimePrice.id,
          token: getValidUserToken({ customerId }),
          currency: 'eur',
          captchaToken: 'captcha_token',
        },
        headers: { authorization: `Bearer ${getValidAuthToken('drive-user-uuid', undefined, { email })}` },
      });

      expect(response.statusCode).toBe(400);
      expect(fetchUserStorage).toHaveBeenCalledWith('drive-user-uuid', email, lifetimePrice.bytes.toString());
      expect(createInvoice).not.toHaveBeenCalled();
    });
  });
});
