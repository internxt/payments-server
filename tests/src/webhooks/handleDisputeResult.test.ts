import axios from 'axios';
import config from '../../../src/config';
import { handleDisputeResult } from '../../../src/webhooks/handleDisputeResult';
import handleLifetimeRefunded from '../../../src/webhooks/handleLifetimeRefunded';
import { getCharge, getDispute, getInvoice, getLogger, getUser, voidPromise } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';

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
      const mockedCharge = getCharge({
        invoice: mockedInvoice.id,
      });
      const mockedDispute = getDispute({
        charge: mockedCharge.id,
      });

      (stripe.charges.retrieve as jest.Mock).mockResolvedValue(mockedCharge);
      (stripe.invoices.retrieve as jest.Mock).mockResolvedValue(mockedInvoice);
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);
      jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

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

      expect(stripe.charges.retrieve).toHaveBeenCalledWith(mockedCharge.id);
      expect(stripe.invoices.retrieve).toHaveBeenCalledWith(mockedCharge.invoice);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mockedCharge.customer);
      expect(paymentService.cancelSubscription).toHaveBeenCalledWith(mockedInvoice.subscription);
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
        invoice: mockedInvoice.id,
      });
      const mockedDispute = getDispute({
        charge: mockedCharge.id,
      });

      (stripe.charges.retrieve as jest.Mock).mockResolvedValue(mockedCharge);
      (stripe.invoices.retrieve as jest.Mock).mockResolvedValue(mockedInvoice);
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);
      (handleLifetimeRefunded as jest.Mock).mockImplementation(voidPromise);
      jest.spyOn(usersService, 'updateUser').mockImplementation(voidPromise);
      jest.spyOn(axios, 'request').mockImplementation(voidPromise);

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

      expect(stripe.charges.retrieve).toHaveBeenCalledWith(mockedCharge.id);
      expect(stripe.invoices.retrieve).toHaveBeenCalledWith(mockedCharge.invoice);
      expect(usersRepository.findUserByCustomerId).toHaveBeenCalledWith(mockedCharge.customer);
      expect(handleLifetimeRefunded).toHaveBeenCalledWith(
        storageService,
        usersService,
        mockedCharge,
        paymentService,
        logger,
        tiersService,
        config,
        cacheService,
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
        invoice: mockedInvoice.id,
      });
      const mockedDispute = getDispute({
        status: 'needs_response',
        charge: mockedCharge.id,
      });

      (stripe.charges.retrieve as jest.Mock).mockResolvedValue(mockedCharge);
      (stripe.invoices.retrieve as jest.Mock).mockResolvedValue(mockedInvoice);
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);
      (handleLifetimeRefunded as jest.Mock).mockImplementation(voidPromise);
      jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

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

      expect(stripe.charges.retrieve).not.toHaveBeenCalled();
      expect(stripe.invoices.retrieve).not.toHaveBeenCalled();
      expect(usersRepository.findUserByCustomerId).not.toHaveBeenCalled();
      expect(paymentService.cancelSubscription).not.toHaveBeenCalled();
      expect(handleLifetimeRefunded).not.toHaveBeenCalled();
    });
  });
});
