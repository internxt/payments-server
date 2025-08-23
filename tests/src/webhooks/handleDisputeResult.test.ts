import axios from 'axios';
import config from '../../../src/config';
import { handleDisputeResult } from '../../../src/webhooks/handleDisputeResult';
import handleLifetimeRefunded from '../../../src/webhooks/handleLifetimeRefunded';
import { getCharge, getDispute, getInvoice, getInvoicePayment, getLogger, getUser, voidPromise } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';
import Stripe from 'stripe';

jest.mock('../../../src/webhooks/handleLifetimeRefunded', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockStripe = {
  charges: {
    retrieve: jest.fn(),
  },
  invoices: {
    retrieve: jest.fn(),
  },
};

const { stripe, paymentService, usersRepository, cacheService, usersService, storageService, tiersService } =
  createTestServices({
    stripe: mockStripe,
  });
const logger = getLogger();

describe('handleDisputeResult()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Dispute Status is Lost', () => {
    it('When the status is lost and the user has a subscription, then the subscription is cancelled and the storage is downgraded', async () => {
      const mockedUser = getUser();
      const mockedInvoice = getInvoice();
      const mockedInvoicePayment = getInvoicePayment({});
      const mockedCharge = getCharge();
      const mockedDispute = getDispute({
        charge: mockedCharge.id,
      });

      const retrieveChargeSpy = jest
        .spyOn(stripe.charges, 'retrieve')
        .mockResolvedValue(mockedCharge as Stripe.Response<Stripe.Charge>);
      const retrieveInvoiceSpy = jest
        .spyOn(stripe.invoices, 'retrieve')
        .mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);
      jest.spyOn(paymentService, 'getInvoicePayment').mockResolvedValue(mockedInvoicePayment);
      const findCustomerByCustomerIdSpy = jest
        .spyOn(usersRepository, 'findUserByCustomerId')
        .mockResolvedValue(mockedUser);
      const cancelSubscriptionSpy = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

      await handleDisputeResult({
        dispute: mockedDispute,
        cacheService: cacheService,
        config,
        paymentService,
        usersService,
        stripe,
        storageService,
        log: logger,
        tiersService,
      });

      expect(retrieveChargeSpy).toHaveBeenCalledWith(mockedCharge.id);
      expect(retrieveInvoiceSpy).toHaveBeenCalledWith(mockedInvoicePayment.data[0].invoice);
      expect(findCustomerByCustomerIdSpy).toHaveBeenCalledWith(mockedCharge.customer);
      expect(cancelSubscriptionSpy).toHaveBeenCalledWith(mockedInvoice.lines.data[0].subscription);
    });

    it('When the status is lost and the user has a lifetime, then the lifetime param is changed to false and the storage is downgraded', async () => {
      const mockedUser = getUser({
        lifetime: true,
      });
      const mockedInvoice = getInvoice({
        customer: mockedUser.customerId,
      });
      const mockedCharge = getCharge({
        customer: mockedUser.customerId,
      });
      const mockedDispute = getDispute({
        charge: mockedCharge.id,
      });
      const mockedInvoicePayment = getInvoicePayment();

      const retrieveChargeSpy = jest
        .spyOn(stripe.charges, 'retrieve')
        .mockResolvedValue(mockedCharge as Stripe.Response<Stripe.Charge>);
      const retrieveInvoiceSpy = jest
        .spyOn(stripe.invoices, 'retrieve')
        .mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);
      const userByCustomerIdSpy = jest.spyOn(usersRepository, 'findUserByCustomerId').mockResolvedValue(mockedUser);
      (handleLifetimeRefunded as jest.Mock).mockImplementation(voidPromise);
      jest.spyOn(usersService, 'updateUser').mockImplementation(voidPromise);
      jest.spyOn(axios, 'request').mockImplementation(voidPromise);
      jest.spyOn(paymentService, 'getInvoicePayment').mockResolvedValue(mockedInvoicePayment);

      await handleDisputeResult({
        dispute: mockedDispute,
        cacheService,
        config,
        paymentService,
        usersService,
        stripe,
        storageService,
        log: logger,
        tiersService,
      });

      expect(retrieveChargeSpy).toHaveBeenCalledWith(mockedCharge.id);
      expect(retrieveInvoiceSpy).toHaveBeenCalledWith(mockedInvoicePayment.data[0].invoice);
      expect(userByCustomerIdSpy).toHaveBeenCalledWith(mockedCharge.customer);
      expect(handleLifetimeRefunded).toHaveBeenCalledWith(
        storageService,
        usersService,
        mockedCharge,
        cacheService,
        paymentService,
        logger,
        tiersService,
        config,
      );
    });
  });

  describe('Dispute Status is Not Lost', () => {
    it('When the status is different to lost, then nothing is changed', async () => {
      const mockedUser = getUser({
        lifetime: true,
      });
      const mockedInvoice = getInvoice({
        customer: mockedUser.customerId,
      });
      const mockedCharge = getCharge({
        customer: mockedUser.customerId,
      });
      const mockedDispute = getDispute({
        status: 'needs_response',
        charge: mockedCharge.id,
      });

      const retrieveChargeSpy = jest
        .spyOn(stripe.charges, 'retrieve')
        .mockResolvedValue(mockedCharge as Stripe.Response<Stripe.Charge>);
      const retrieveInvoiceSpy = jest
        .spyOn(stripe.invoices, 'retrieve')
        .mockResolvedValue(mockedInvoice as Stripe.Response<Stripe.Invoice>);
      const userByCustomerIdSpy = jest.spyOn(usersRepository, 'findUserByCustomerId').mockResolvedValue(mockedUser);
      (stripe.charges.retrieve as jest.Mock).mockResolvedValue(mockedCharge);
      (stripe.invoices.retrieve as jest.Mock).mockResolvedValue(mockedInvoice);
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);
      (handleLifetimeRefunded as jest.Mock).mockImplementation(voidPromise);
      const cancelSubSpy = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

      await handleDisputeResult({
        dispute: mockedDispute,
        cacheService,
        config,
        paymentService,
        usersService,
        stripe,
        storageService,
        log: logger,
        tiersService,
      });

      expect(retrieveChargeSpy).not.toHaveBeenCalled();
      expect(retrieveInvoiceSpy).not.toHaveBeenCalled();
      expect(userByCustomerIdSpy).not.toHaveBeenCalled();
      expect(cancelSubSpy).not.toHaveBeenCalled();
      expect(handleLifetimeRefunded).not.toHaveBeenCalled();
    });
  });
});
