import { isInvoicePaidOutOfBand } from '../../../src/utils/isInvoicePaidOutOfBand';
import { getInvoice } from '../fixtures';

describe('Check if an invoice is paid out of band', () => {
  describe('Is paid out of band', () => {
    test('When the invoice has amount due but no payments and no discounts, then it is paid out of band', () => {
      const mockedInvoice = getInvoice({
        status: 'paid',
        amount_due: 1000,
        payments: {
          data: [],
        },
        total_discount_amounts: [],
      });

      const isPaidOutOfBand = isInvoicePaidOutOfBand(mockedInvoice);

      expect(isPaidOutOfBand).toBeTruthy();
    });
  });

  describe('Is not paid out of band', () => {
    test('When the amount is 0, then it is not paid out of band', () => {
      const mockedInvoice = getInvoice({
        status: 'paid',
        amount_due: 0,
        payments: {
          data: [],
        },
        total_discount_amounts: [],
      });

      const isPaidOutOfBand = isInvoicePaidOutOfBand(mockedInvoice);

      expect(isPaidOutOfBand).toBeFalsy();
    });

    test('When there are discount amounts, then it is not paid out of band', () => {
      const mockedInvoice = getInvoice({
        status: 'paid',
        amount_due: 1000,
        payments: {
          data: [],
        },
        total_discount_amounts: [
          {
            amount: 100,
          },
        ],
      });

      const isPaidOutOfBand = isInvoicePaidOutOfBand(mockedInvoice);

      expect(isPaidOutOfBand).toBeFalsy();
    });

    test('When the amount is greater than 0 and there is a payment, then it is not paid out of band', () => {
      const mockedInvoice = getInvoice({
        status: 'paid',
        amount_due: 1000,
        payments: {
          data: [
            {
              amount_paid: 1000,
            },
          ],
        },
        total_discount_amounts: [],
      });

      const isPaidOutOfBand = isInvoicePaidOutOfBand(mockedInvoice);

      expect(isPaidOutOfBand).toBeFalsy();
    });
  });
});
