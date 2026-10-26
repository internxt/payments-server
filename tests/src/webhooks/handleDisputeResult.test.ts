import axios from 'axios';
import { handleDisputeResult } from '../../../src/webhooks/handleDisputeResult';
import handleLifetimeRefunded from '../../../src/webhooks/handleLifetimeRefunded';
import { NotFoundError } from '../../../src/errors/Errors';
import { getCharge, getDispute, getUser, voidPromise } from '../fixtures';
import { createTestServices } from '../helpers/services-factory';

jest.mock('../../../src/webhooks/handleLifetimeRefunded', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const {
  stripe,
  paymentService,
  usersRepository,
  cacheService,
  usersService,
  storageService,
  tiersService,
  preCreatedUserService,
} = createTestServices();

const mockDisputedCharge = ({
  customerId,
  invoiceId,
  subscriptionId,
}: {
  customerId: string;
  invoiceId?: string;
  subscriptionId?: string;
}) => {
  const charge = getCharge({ customer: customerId, payment_intent: 'pi_disputed' });
  jest.spyOn(stripe.charges, 'retrieve').mockResolvedValue(charge as any);
  jest
    .spyOn(stripe.invoicePayments, 'list')
    .mockResolvedValue({ data: invoiceId ? [{ invoice: invoiceId }] : [] } as any);
  jest.spyOn(stripe.invoices, 'retrieve').mockResolvedValue({
    id: invoiceId,
    parent: { subscription_details: { subscription: subscriptionId } },
  } as any);
  return charge;
};

const handleDispute = (dispute = getDispute()) =>
  handleDisputeResult({
    dispute,
    cacheService,
    preCreatedUserService,
    paymentService,
    usersService,
    storageService,
    tiersService,
  });

describe('handleDisputeResult()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Dispute Status is Lost', () => {
    test('When the status is lost and the user has a subscription, then the subscription of the disputed invoice is cancelled', async () => {
      const mockedUser = getUser();
      mockDisputedCharge({
        customerId: mockedUser.customerId,
        invoiceId: 'in_disputed',
        subscriptionId: 'sub_disputed',
      });
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);
      const cancelSubscription = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

      await handleDispute();

      expect(cancelSubscription).toHaveBeenCalledWith('sub_disputed');
    });

    test('When the status is lost and the user has a lifetime, then the lifetime is removed', async () => {
      const mockedUser = getUser({ lifetime: true });
      const charge = mockDisputedCharge({ customerId: mockedUser.customerId, invoiceId: 'in_disputed' });
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);
      (handleLifetimeRefunded as jest.Mock).mockImplementation(voidPromise);
      jest.spyOn(usersService, 'updateUser').mockImplementation(voidPromise);
      jest.spyOn(axios, 'request').mockImplementation(voidPromise);

      await handleDispute();

      expect(handleLifetimeRefunded).toHaveBeenCalledWith(
        storageService,
        usersService,
        charge,
        cacheService,
        paymentService,
        tiersService,
        preCreatedUserService,
      );
    });

    test('When the status is lost but the subscription charge does not belong to an invoice, then an error indicating so is thrown', async () => {
      const mockedUser = getUser();
      mockDisputedCharge({ customerId: mockedUser.customerId });
      (usersRepository.findUserByCustomerId as jest.Mock).mockResolvedValue(mockedUser);
      const cancelSubscription = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

      await expect(handleDispute()).rejects.toThrow(NotFoundError);
      expect(cancelSubscription).not.toHaveBeenCalled();
    });
  });

  describe('Dispute Status is Not Lost', () => {
    test('When the status is different to lost, then nothing is changed', async () => {
      const mockedUser = getUser({ lifetime: true });
      mockDisputedCharge({ customerId: mockedUser.customerId, invoiceId: 'in_disputed' });
      const cancelSubscription = jest.spyOn(paymentService, 'cancelSubscription').mockImplementation(voidPromise);

      await handleDispute(getDispute({ status: 'needs_response' }));

      expect(cancelSubscription).not.toHaveBeenCalled();
      expect(handleLifetimeRefunded).not.toHaveBeenCalled();
    });
  });
});
