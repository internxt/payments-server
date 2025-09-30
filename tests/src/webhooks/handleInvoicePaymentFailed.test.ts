import { FastifyBaseLogger } from 'fastify';
import { getCustomer, getInvoice, getLogger, getProduct } from '../fixtures';
import handleInvoicePaymentFailed from '../../../src/webhooks/handleInvoicePaymentFailed';
import { createTestServices } from '../helpers/services-factory';

const logger: jest.Mocked<FastifyBaseLogger> = getLogger();

const { paymentService, usersService, objectStorageService } = createTestServices();

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('Handle Invoice Payment Failed', () => {
  it('Should notify gateway service when payment fails for any invoice', async () => {
    const customerId = 'cus_test123';
    const mockedCustomer = getCustomer({ id: customerId, email: 'test@internxt.com' });
    const mockedInvoice = getInvoice({ customer: customerId });
    const mockedProduct = getProduct({ params: { metadata: { type: 'object-storage' } } });
    const mockedUser = { uuid: 'test-uuid-123', email: 'test@internxt.com' };

    const getCustomerSpy = jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    const getProductSpy = jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    const findUserByCustomerIDSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser as any);
    const notifyFailedPaymentSpy = jest.spyOn(usersService, 'notifyFailedPayment').mockResolvedValue();
    const suspendAccountSpy = jest.spyOn(objectStorageService, 'suspendAccount').mockResolvedValue();

    await handleInvoicePaymentFailed(mockedInvoice as any, objectStorageService, paymentService, usersService, logger);

    expect(getCustomerSpy).toHaveBeenCalledWith(customerId);
    expect(findUserByCustomerIDSpy).toHaveBeenCalledWith(customerId);
    expect(notifyFailedPaymentSpy).toHaveBeenCalledWith('test-uuid-123');
  });

  it('Should continue execution if gateway notification fails', async () => {
    const customerId = 'cus_test123';
    const mockedCustomer = getCustomer({ id: customerId, email: 'test@internxt.com' });
    const mockedInvoice = getInvoice({ customer: customerId });
    const mockedProduct = getProduct({ params: { metadata: { type: 'non-object-storage' } } });
    const mockedUser = { uuid: 'test-uuid-123', email: 'test@internxt.com' };

    jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser as any);
    jest.spyOn(usersService, 'notifyFailedPayment').mockRejectedValue(new Error('Gateway error'));

    await expect(
      handleInvoicePaymentFailed(mockedInvoice as any, objectStorageService, paymentService, usersService, logger)
    ).resolves.toBeUndefined();
  });

  it('Should throw error when customer is not found in invoice', async () => {
    const mockedInvoice = getInvoice({ customer: null });

    await expect(
      handleInvoicePaymentFailed(mockedInvoice as any, objectStorageService, paymentService, usersService, logger)
    ).rejects.toThrow('No customer found for this payment');
  });
});