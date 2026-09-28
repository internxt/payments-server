import { FastifyInstance } from 'fastify';
import axios, { AxiosError, AxiosResponse } from 'axios';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { getConfirmationToken, getCustomer, getValidAuthToken, getValidUserToken } from '../fixtures';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import { UsersService } from '../../../src/services/users.service';
import { PaymentService } from '../../../src/services/payment.service';
import * as verifyRecaptcha from '../../../src/utils/verifyRecaptcha';
import { stripePaymentsAdapter } from '../../../src/infrastructure/adapters/stripe.adapter';
import { CONFIRMATION_TOKEN_MAX_AGE_IN_MINUTES } from '../../../src/constants';

jest.mock('ioredis', () => require('ioredis-mock'));

const nowInSeconds = () => Math.floor(Date.now() / 1000);

const driveRespondsWith = (status: number) =>
  new AxiosError('Drive error', 'ERR_BAD_RESPONSE', undefined, undefined, { status } as AxiosResponse);

const drivePreCreatesUser = ({ uuid = randomUUID(), setupPending = false } = {}) => {
  const preCreate = jest.spyOn(axios, 'post').mockResolvedValue({ data: { uuid, setupPending } });
  return { uuid, preCreate };
};

const driveHasRegisteredUser = () => jest.spyOn(axios, 'post').mockRejectedValue(driveRespondsWith(409));

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

const stripeUpdatesCustomers = () =>
  jest
    .spyOn(stripePaymentsAdapter.provider.customers, 'update')
    .mockImplementation(async (id) => getCustomer({ id }) as Stripe.Response<Stripe.Customer>);

let app: FastifyInstance;

beforeAll(async () => {
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
      expect(preCreate).toHaveBeenCalledWith(
        expect.stringContaining('/gateway/users/pre-create'),
        { email },
        expect.anything(),
      );
      expect(createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          email,
          name: billingDetails.customerName,
          address: expect.objectContaining({ country: 'ES', postal_code: '08001', city: 'Barcelona' }),
          metadata: { cello_ucc: 'referral-code', new_user_id: uuid },
        }),
      );
    });

    test('When the buyer repeats the checkout with the same email, then the same customer is reused and updated instead of creating another one', async () => {
      const email = newBuyerEmail();
      const { uuid } = drivePreCreatesUser();
      const createCustomer = stripeCreatesCustomers();
      const updateCustomer = stripeUpdatesCustomers();
      const firstAttempt = await prepareCustomer({
        ...billingDetails,
        email,
        confirmationTokenId: stripeHasConfirmationToken().id,
      });

      const secondAttempt = await prepareCustomer({
        ...billingDetails,
        customerName: 'Jane Updated',
        email,
        confirmationTokenId: stripeHasConfirmationToken().id,
      });

      expect(secondAttempt.statusCode).toBe(200);
      expect(secondAttempt.json().customerId).toBe(firstAttempt.json().customerId);
      expect(createCustomer).toHaveBeenCalledTimes(1);
      expect(updateCustomer).toHaveBeenCalledWith(
        firstAttempt.json().customerId,
        expect.objectContaining({ email, name: 'Jane Updated', metadata: { new_user_id: uuid } }),
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
      expect(preCreate).toHaveBeenCalledWith(expect.any(String), { email }, expect.anything());
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
      const updateCustomer = stripeUpdatesCustomers();

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
      expect(updateCustomer).not.toHaveBeenCalled();
    });

    test('When Drive cannot be reached, then the request fails and no customer is created', async () => {
      jest.spyOn(axios, 'post').mockRejectedValue(driveRespondsWith(503));
      const createCustomer = stripeCreatesCustomers();

      const response = await prepareCustomer({
        ...billingDetails,
        email: newBuyerEmail(),
        confirmationTokenId: stripeHasConfirmationToken().id,
      });

      expect(response.statusCode).toBe(500);
      expect(createCustomer).not.toHaveBeenCalled();
    });

    describe('When the payment attempt cannot be proven', () => {
      const tooOldInSeconds = (CONFIRMATION_TOKEN_MAX_AGE_IN_MINUTES + 1) * 60;

      test('When the payment confirmation was already used for another checkout, then it is rejected and nothing else is created', async () => {
        const confirmationTokenId = stripeHasConfirmationToken().id;
        const { preCreate } = drivePreCreatesUser();
        const createCustomer = stripeCreatesCustomers();
        await prepareCustomer({ ...billingDetails, email: newBuyerEmail(), confirmationTokenId });

        const reusedAttempt = await prepareCustomer({ ...billingDetails, email: newBuyerEmail(), confirmationTokenId });

        expect(reusedAttempt.statusCode).toBe(403);
        expect(preCreate).toHaveBeenCalledTimes(1);
        expect(createCustomer).toHaveBeenCalledTimes(1);
      });

      test.each([
        ['has expired', () => ({ expires_at: nowInSeconds() - 1 })],
        ['was already used for a payment', () => ({ payment_intent: 'pi_already_used' })],
        ['was already used for a setup', () => ({ setup_intent: 'seti_already_used' })],
        ['is not recent', () => ({ created: nowInSeconds() - tooOldInSeconds })],
      ])('When the payment confirmation %s, then it is rejected and nothing is created', async (_, params) => {
        const confirmationToken = stripeHasConfirmationToken(params());
        const preCreate = jest.spyOn(axios, 'post');
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

      test('When the payment confirmation does not exist, then it is rejected and nothing is created', async () => {
        jest.spyOn(stripePaymentsAdapter.provider.confirmationTokens, 'retrieve').mockRejectedValue(
          new Stripe.errors.StripeInvalidRequestError({
            type: 'invalid_request_error',
            code: 'resource_missing',
            message: 'No such confirmationtoken',
          }),
        );
        const preCreate = jest.spyOn(axios, 'post');
        const createCustomer = stripeCreatesCustomers();

        const response = await prepareCustomer({
          ...billingDetails,
          email: newBuyerEmail(),
          confirmationTokenId: 'ctoken_unknown',
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
    });

    test('When the email is not valid, then the request is rejected as invalid', async () => {
      const response = await prepareCustomer({
        ...billingDetails,
        email: 'not-an-email',
        confirmationTokenId: 'ctoken_123',
      });

      expect(response.statusCode).toBe(400);
    });

    test.each(['country', 'captchaToken'])(
      'When the required billing field "%s" is missing, then the request is rejected as invalid',
      async (field) => {
        const { [field as keyof typeof billingDetails]: _omitted, ...incompleteDetails } = billingDetails;

        const response = await prepareCustomer({
          ...incompleteDetails,
          email: newBuyerEmail(),
          confirmationTokenId: 'ctoken_123',
        });

        expect(response.statusCode).toBe(400);
      },
    );

    test('When the captcha fails, then the request is rejected before the payment confirmation is used', async () => {
      jest.spyOn(verifyRecaptcha, 'verifyRecaptcha').mockResolvedValue(false);
      const retrieveConfirmation = jest.spyOn(stripePaymentsAdapter.provider.confirmationTokens, 'retrieve');
      const preCreate = jest.spyOn(axios, 'post');

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
      const preCreate = jest.spyOn(axios, 'post');

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
});
