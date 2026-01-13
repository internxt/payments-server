import { objectStorageService } from '../../../../../src/services/objectStorage.service';
import { InvoiceFailedHandler } from '../../../../../src/webhooks/events/invoices/InvoiceFailedHandler';
import { getInvoice, getUser } from '../../../fixtures';
import { createTestServices } from '../../../helpers/services-factory';

const { usersService } = createTestServices();

describe('Invoice Payment Failed Handler', () => {
  let invoiceFailedHandler: InvoiceFailedHandler;

  beforeEach(() => {
    invoiceFailedHandler = new InvoiceFailedHandler(usersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('When the failed invoice is an object storage invoice, then the object storage account is suspended', async () => {
    const mockedInvoice = getInvoice({ status: 'paid' });

    const findObjectStorageProductSpy = jest
      .spyOn(invoiceFailedHandler, 'findObjectStorageProduct')
      .mockResolvedValue(mockedInvoice.lines.data[0]);
    const suspendAccountSpy = jest.spyOn(objectStorageService, 'suspendAccount').mockResolvedValue();

    await invoiceFailedHandler.run(mockedInvoice);

    expect(findObjectStorageProductSpy).toHaveBeenCalledWith(mockedInvoice);
    expect(suspendAccountSpy).toHaveBeenCalledWith({ customerId: mockedInvoice.customer as string });
  });

  test('When the failed invoice is not an object storage invoice, then the user is notified of the payment failure', async () => {
    const mockedInvoice = getInvoice({ status: 'paid' });
    const mockedUser = getUser();

    const findObjectStorageProductSpy = jest
      .spyOn(invoiceFailedHandler, 'findObjectStorageProduct')
      .mockResolvedValue(undefined);
    const getUserByCustomerIDSpy = jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    const notifyFailedPaymentSpy = jest.spyOn(usersService, 'notifyFailedPayment').mockResolvedValue();

    await invoiceFailedHandler.run(mockedInvoice);

    expect(findObjectStorageProductSpy).toHaveBeenCalledWith(mockedInvoice);
    expect(getUserByCustomerIDSpy).toHaveBeenCalledWith(mockedInvoice.customer);
    expect(notifyFailedPaymentSpy).toHaveBeenCalledWith(mockedUser.uuid);
  });
});
