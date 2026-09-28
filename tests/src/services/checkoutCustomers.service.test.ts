import { randomUUID } from 'node:crypto';
import { createTestServices } from '../helpers/services-factory';
import { getConfirmationToken, getCustomer, getUser } from '../fixtures';
import { stripePaymentsAdapter } from '../../../src/infrastructure/adapters/stripe.adapter';
import { ConfirmationToken } from '../../../src/infrastructure/domain/entities/confirmationToken';
import { Customer } from '../../../src/infrastructure/domain/entities/customer';
import {
  AccountSetupPendingError,
  DriveAccountAlreadyExistsError,
  InvalidConfirmationTokenError,
} from '../../../src/errors/PaymentErrors';
import { CONFIRMATION_TOKEN_MAX_AGE_IN_MINUTES } from '../../../src/constants';

jest.mock('ioredis', () => require('ioredis-mock'));

describe('Checkout customers', () => {
  const { checkoutCustomersService, usersService, usersRepository } = createTestServices();
  const customerDetails = {
    name: 'Jane Doe',
    address: { line1: 'Street 123', city: 'Barcelona', postalCode: '08001', country: 'ES' },
    metadata: { cello_ucc: 'referral-code' },
  };

  const nowInSeconds = () => Math.floor(Date.now() / 1000);

  const stripeHasConfirmationToken = (params?: Parameters<typeof getConfirmationToken>[0]) => {
    const confirmationToken = ConfirmationToken.toDomain(getConfirmationToken(params));
    jest.spyOn(stripePaymentsAdapter, 'getConfirmationToken').mockResolvedValue(confirmationToken);
    return confirmationToken;
  };

  const drivePreCreatesUser = ({ uuid = randomUUID(), setupPending = false } = {}) => {
    const preCreate = jest.spyOn(usersService, 'preCreateUser').mockResolvedValue({ uuid, setupPending });
    return { uuid, preCreate };
  };

  const noCustomerLinkedTo = () => (usersRepository.findUserByUuid as jest.Mock).mockResolvedValue(null);

  const stripeCreatesCustomer = () => {
    const customer = Customer.toDomain(getCustomer());
    const createCustomer = jest.spyOn(stripePaymentsAdapter, 'createCustomer').mockResolvedValue(customer);
    return { customer, createCustomer };
  };

  const payWith = (confirmationTokenId: string, email = `buyer.${randomUUID()}@internxt.com`) =>
    checkoutCustomersService.upsertCustomerForPaymentAttempt({ email, confirmationTokenId, customerDetails });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Preparing the customer of a buyer without an account', () => {
    test('When the buyer is new, then a customer is created for the pre-created Drive user and linked to it', async () => {
      const email = 'new.buyer@internxt.com';
      const confirmationToken = stripeHasConfirmationToken();
      const { uuid } = drivePreCreatesUser();
      noCustomerLinkedTo();
      const { customer, createCustomer } = stripeCreatesCustomer();

      const customerId = await payWith(confirmationToken.id, email);

      expect(customerId).toBe(customer.id);
      expect(createCustomer).toHaveBeenCalledWith({
        ...customerDetails,
        email,
        metadata: { cello_ucc: 'referral-code', new_user_id: uuid },
      });
      expect(usersRepository.insertUser).toHaveBeenCalledWith({ customerId: customer.id, uuid, lifetime: false });
    });

    test('When the pre-created Drive user already has a customer, then that customer is updated and reused', async () => {
      const confirmationToken = stripeHasConfirmationToken();
      const { uuid } = drivePreCreatesUser();
      const linkedUser = getUser({ uuid });
      (usersRepository.findUserByUuid as jest.Mock).mockResolvedValue(linkedUser);
      const updateCustomer = jest.spyOn(stripePaymentsAdapter, 'updateCustomer').mockResolvedValue({} as Customer);
      const createCustomer = jest.spyOn(stripePaymentsAdapter, 'createCustomer');

      const customerId = await payWith(confirmationToken.id, 'buyer@internxt.com');

      expect(customerId).toBe(linkedUser.customerId);
      expect(updateCustomer).toHaveBeenCalledWith(linkedUser.customerId, {
        ...customerDetails,
        email: 'buyer@internxt.com',
        metadata: { cello_ucc: 'referral-code', new_user_id: uuid },
      });
      expect(createCustomer).not.toHaveBeenCalled();
      expect(usersRepository.insertUser).not.toHaveBeenCalled();
    });

    test('When looking up the linked customer fails, then no customer is created', async () => {
      const confirmationToken = stripeHasConfirmationToken();
      drivePreCreatesUser();
      const databaseError = new Error('Mongo is down');
      (usersRepository.findUserByUuid as jest.Mock).mockRejectedValue(databaseError);
      const createCustomer = jest.spyOn(stripePaymentsAdapter, 'createCustomer');

      await expect(payWith(confirmationToken.id)).rejects.toBe(databaseError);
      expect(createCustomer).not.toHaveBeenCalled();
    });

    test('When the email belongs to a registered Drive user, then an error indicating so is thrown', async () => {
      const confirmationToken = stripeHasConfirmationToken();
      jest.spyOn(usersService, 'preCreateUser').mockRejectedValue(new DriveAccountAlreadyExistsError());
      const createCustomer = jest.spyOn(stripePaymentsAdapter, 'createCustomer');

      await expect(payWith(confirmationToken.id)).rejects.toThrow(DriveAccountAlreadyExistsError);
      expect(createCustomer).not.toHaveBeenCalled();
    });

    test('When the email already paid a plan whose setup is pending, then an error indicating so is thrown', async () => {
      const confirmationToken = stripeHasConfirmationToken();
      drivePreCreatesUser({ setupPending: true });
      const createCustomer = jest.spyOn(stripePaymentsAdapter, 'createCustomer');

      await expect(payWith(confirmationToken.id)).rejects.toThrow(AccountSetupPendingError);
      expect(createCustomer).not.toHaveBeenCalled();
    });

    test('When the payment confirmation was already used, then it is rejected and nothing is created', async () => {
      const confirmationToken = stripeHasConfirmationToken();
      const { preCreate } = drivePreCreatesUser();
      noCustomerLinkedTo();
      const { createCustomer } = stripeCreatesCustomer();
      await payWith(confirmationToken.id);

      await expect(payWith(confirmationToken.id)).rejects.toThrow(InvalidConfirmationTokenError);
      expect(preCreate).toHaveBeenCalledTimes(1);
      expect(createCustomer).toHaveBeenCalledTimes(1);
    });

    test.each([
      ['has expired', () => ({ expires_at: nowInSeconds() - 1 })],
      ['was already used for a payment', () => ({ payment_intent: 'pi_already_used' })],
      ['was already used for a setup', () => ({ setup_intent: 'seti_already_used' })],
      ['is not recent', () => ({ created: nowInSeconds() - (CONFIRMATION_TOKEN_MAX_AGE_IN_MINUTES + 1) * 60 })],
    ])('When the payment confirmation %s, then it is rejected before Drive is contacted', async (_, params) => {
      const confirmationToken = stripeHasConfirmationToken(params());
      const preCreate = jest.spyOn(usersService, 'preCreateUser');
      const createCustomer = jest.spyOn(stripePaymentsAdapter, 'createCustomer');

      await expect(payWith(confirmationToken.id)).rejects.toThrow(InvalidConfirmationTokenError);
      expect(preCreate).not.toHaveBeenCalled();
      expect(createCustomer).not.toHaveBeenCalled();
    });

    test('When the payment confirmation does not exist, then it is rejected before Drive is contacted', async () => {
      jest.spyOn(stripePaymentsAdapter, 'getConfirmationToken').mockRejectedValue(new InvalidConfirmationTokenError());
      const preCreate = jest.spyOn(usersService, 'preCreateUser');

      await expect(payWith('ctoken_unknown')).rejects.toThrow(InvalidConfirmationTokenError);
      expect(preCreate).not.toHaveBeenCalled();
    });
  });

  describe('Checking a buyer without an account before paying', () => {
    test('When the email can buy, then the uuid of its pre-created Drive user is returned', async () => {
      const { uuid } = drivePreCreatesUser();

      await expect(checkoutCustomersService.preCreateBuyerWithoutAccount('buyer@internxt.com')).resolves.toBe(uuid);
    });

    test('When the email already paid a plan whose setup is pending, then an error indicating so is thrown', async () => {
      drivePreCreatesUser({ setupPending: true });

      await expect(checkoutCustomersService.preCreateBuyerWithoutAccount('buyer@internxt.com')).rejects.toThrow(
        AccountSetupPendingError,
      );
    });
  });

  describe('Preparing the customer of a logged in Drive user', () => {
    test('When the user has no customer yet, then one is created and linked to the user', async () => {
      const driveUser = { uuid: randomUUID(), email: 'user@internxt.com' };
      noCustomerLinkedTo();
      const { customer, createCustomer } = stripeCreatesCustomer();

      const customerId = await checkoutCustomersService.upsertCustomerForDriveUser(driveUser, customerDetails);

      expect(customerId).toBe(customer.id);
      expect(createCustomer).toHaveBeenCalledWith({ ...customerDetails, email: driveUser.email });
      expect(usersRepository.insertUser).toHaveBeenCalledWith({
        customerId: customer.id,
        uuid: driveUser.uuid,
        lifetime: false,
      });
    });

    test('When the user already has a customer, then it is updated and reused', async () => {
      const linkedUser = getUser();
      (usersRepository.findUserByUuid as jest.Mock).mockResolvedValue(linkedUser);
      const updateCustomer = jest.spyOn(stripePaymentsAdapter, 'updateCustomer').mockResolvedValue({} as Customer);

      const customerId = await checkoutCustomersService.upsertCustomerForDriveUser(
        { uuid: linkedUser.uuid, email: 'user@internxt.com' },
        customerDetails,
      );

      expect(customerId).toBe(linkedUser.customerId);
      expect(updateCustomer).toHaveBeenCalledWith(linkedUser.customerId, {
        ...customerDetails,
        email: 'user@internxt.com',
      });
    });

    test('When looking up the linked customer fails, then a new customer is created as before', async () => {
      const driveUser = { uuid: randomUUID(), email: 'user@internxt.com' };
      (usersRepository.findUserByUuid as jest.Mock).mockRejectedValue(new Error('Mongo is down'));
      const { customer } = stripeCreatesCustomer();

      await expect(checkoutCustomersService.upsertCustomerForDriveUser(driveUser, customerDetails)).resolves.toBe(
        customer.id,
      );
    });
  });
});
