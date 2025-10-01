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
  describe('When processing valid payment failure', () => {
    it('When payment fails for object storage invoice, then should notify gateway service and suspend account', async () => {
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
  });

  it('When gateway notification fails, then should continue execution without throwing error', async () => {
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

  it('When gateway notification fails, then should log error with message details', async () => {
    const customerId = 'cus_test123';
    const errorMessage = 'Gateway connection timeout';
    const mockedCustomer = getCustomer({ id: customerId, email: 'test@internxt.com' });
    const mockedInvoice = getInvoice({ customer: customerId });
    const mockedProduct = getProduct({ params: { metadata: { type: 'non-object-storage' } } });
    const mockedUser = { uuid: 'test-uuid-123', email: 'test@internxt.com' };

    jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser as any);
    jest.spyOn(usersService, 'notifyFailedPayment').mockRejectedValue(new Error(errorMessage));
    const loggerErrorSpy = jest.spyOn(logger, 'error');

    await handleInvoicePaymentFailed(mockedInvoice as any, objectStorageService, paymentService, usersService, logger);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      `Failed to send payment notification for customer ${customerId}. Error: ${errorMessage}`
    );
  });

  it('When customer is not found in invoice, then should throw error', async () => {
    const mockedInvoice = getInvoice({ customer: null });

    await expect(
      handleInvoicePaymentFailed(mockedInvoice as any, objectStorageService, paymentService, usersService, logger)
    ).rejects.toThrow('No customer found for this payment');
  });

  it('When user is not found in payments database, then should skip notification and suspend account', async () => {
    const customerId = 'cus_test123';
    const mockedCustomer = getCustomer({ id: customerId, email: 'test@internxt.com' });
    const mockedInvoice = getInvoice({ customer: customerId });
    const mockedProduct = getProduct({ params: { metadata: { type: 'object-storage' } } });

    jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    jest.spyOn(usersService, 'findUserByCustomerID').mockRejectedValue(new Error('User not found'));
    const notifyFailedPaymentSpy = jest.spyOn(usersService, 'notifyFailedPayment');
    const suspendAccountSpy = jest.spyOn(objectStorageService, 'suspendAccount').mockResolvedValue();

    await handleInvoicePaymentFailed(mockedInvoice as any, objectStorageService, paymentService, usersService, logger);

    expect(notifyFailedPaymentSpy).not.toHaveBeenCalled();
    expect(suspendAccountSpy).toHaveBeenCalledWith({ customerId });
  });

  it('When failed payment notification is sent successfully, then should log success message', async () => {
    const customerId = 'cus_test123';
    const mockedCustomer = getCustomer({ id: customerId, email: 'test@internxt.com' });
    const mockedInvoice = getInvoice({ customer: customerId });
    const mockedProduct = getProduct({ params: { metadata: { type: 'object-storage' } } });
    const mockedUser = { uuid: 'test-uuid-123', email: 'test@internxt.com' };

    jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser as any);
    jest.spyOn(usersService, 'notifyFailedPayment').mockResolvedValue();
    jest.spyOn(objectStorageService, 'suspendAccount').mockResolvedValue();
    const loggerInfoSpy = jest.spyOn(logger, 'info');

    await handleInvoicePaymentFailed(mockedInvoice as any, objectStorageService, paymentService, usersService, logger);

    expect(loggerInfoSpy).toHaveBeenCalledWith(
      `Failed payment notification sent for customer ${customerId} (user UUID: ${mockedUser.uuid})`
    );
  });

  it('When user is not found for customer, then should log warning message', async () => {
    const customerId = 'cus_test123';
    const mockedCustomer = getCustomer({ id: customerId, email: 'test@internxt.com' });
    const mockedInvoice = getInvoice({ customer: customerId });
    const mockedProduct = getProduct({ params: { metadata: { type: 'object-storage' } } });

    jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(null as any);
    jest.spyOn(objectStorageService, 'suspendAccount').mockResolvedValue();
    const loggerWarnSpy = jest.spyOn(logger, 'warn');

    await handleInvoicePaymentFailed(mockedInvoice as any, objectStorageService, paymentService, usersService, logger);

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      `User not found for customer ${customerId}. Skipping failed payment notification.`
    );
  });

  it('When invoice has no object storage products, then should notify user but not suspend account', async () => {
    const customerId = 'cus_test123';
    const mockedCustomer = getCustomer({ id: customerId, email: 'test@internxt.com' });
    const mockedInvoice = getInvoice({ customer: customerId });
    const mockedProduct = getProduct({ params: { metadata: { type: 'regular-product' } } });
    const mockedUser = { uuid: 'test-uuid-123', email: 'test@internxt.com' };

    jest.spyOn(paymentService, 'getCustomer').mockResolvedValue(mockedCustomer as any);
    jest.spyOn(paymentService, 'getProduct').mockResolvedValue(mockedProduct as any);
    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser as any);
    const notifyFailedPaymentSpy = jest.spyOn(usersService, 'notifyFailedPayment');
    const suspendAccountSpy = jest.spyOn(objectStorageService, 'suspendAccount');

    await handleInvoicePaymentFailed(mockedInvoice as any, objectStorageService, paymentService, usersService, logger);

    expect(notifyFailedPaymentSpy).toHaveBeenCalledWith('test-uuid-123');
    expect(suspendAccountSpy).not.toHaveBeenCalled();
  });
});