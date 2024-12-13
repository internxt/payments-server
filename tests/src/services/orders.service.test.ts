import Stripe from 'stripe';
import XLSX from 'xlsx';
import { FastifyBaseLogger } from 'fastify';
import { processOrderId, processUploadedFile } from '../../../src/services/orders.service';
import { Chance } from 'chance';

const chance = new Chance();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      retrieve: jest.fn(),
    },
  }));
});

jest.mock('xlsx', () => ({
  read: jest.fn(),
  utils: {
    sheet_to_json: jest.fn(),
  },
}));

describe('impact.service', () => {
  let stripe: jest.Mocked<Stripe>;
  const mockLog = {
    error: jest.fn(),
  } as unknown as FastifyBaseLogger;

  beforeEach(() => {
    stripe = new Stripe('fake-key', { apiVersion: '2024-04-10' }) as jest.Mocked<Stripe>;
    jest.clearAllMocks();
  });

  describe('processOrderId', () => {
    it('When the payment intent is refunded, then it should return refunded details', async () => {
      const mockPaymentIntent = {
        status: 'succeeded',
        latest_charge: { refunded: true },
      } as Partial<Stripe.PaymentIntent> as Stripe.PaymentIntent;

      (stripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue(mockPaymentIntent);

      const orderId = `pi_${chance.string({ length: 10 })}`;
      const result = await processOrderId(orderId, stripe, mockLog);

      expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(orderId, {
        expand: ['latest_charge'],
      });
      expect(result).toEqual({
        orderId,
        type: 'payment_intent',
        refunded: true,
      });
    });

    it('When the order ID is invalid, then it should return an error type', async () => {
      const orderId = chance.string({ length: 10 });
      const result = await processOrderId(orderId, stripe, mockLog);

      expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
      expect(result).toEqual({
        orderId,
        type: 'error',
      });
    });

    it('When the Stripe API fails, then it should log an error and return an error type', async () => {
      const orderId = `pi_${chance.string({ length: 10 })}`;
      (stripe.paymentIntents.retrieve as jest.Mock).mockRejectedValue(new Error('Stripe API error'));

      const result = await processOrderId(orderId, stripe, mockLog);

      expect(mockLog.error).toHaveBeenCalledWith(`Error processing order ID ${orderId}: Stripe API error`);
      expect(result).toEqual({
        orderId,
        type: 'error',
      });
    });
  });

  describe('processUploadedFile', () => {
    it('When the file has multiple columns, then it should throw an error', async () => {
      const mockBuffer = Buffer.from('mock data');
      jest.spyOn(XLSX, 'read').mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      });
      jest.spyOn(XLSX.utils, 'sheet_to_json').mockReturnValue([{ 'order-id': 'pi_valid_1', 'extra-column': 'value' }]);

      await expect(processUploadedFile(mockBuffer, stripe, mockLog)).rejects.toThrow(
        'Invalid XLSX structure: The file must have exactly one column with the header "order-id".',
      );
      expect(mockLog.error).toHaveBeenCalledWith(
        'Invalid XLSX structure: The file must have exactly one column with the header "order-id".',
      );
    });

    it('When the file has the wrong column name, then it should throw an error', async () => {
      const mockBuffer = Buffer.from('mock data');
      jest.spyOn(XLSX, 'read').mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      });
      jest.spyOn(XLSX.utils, 'sheet_to_json').mockReturnValue([{ 'wrong-header': 'pi_valid_1' }]);

      await expect(processUploadedFile(mockBuffer, stripe, mockLog)).rejects.toThrow(
        'Invalid XLSX structure: The file must have exactly one column with the header "order-id".',
      );
      expect(mockLog.error).toHaveBeenCalledWith(
        'Invalid XLSX structure: The file must have exactly one column with the header "order-id".',
      );
    });

    it('When the file has a single "order-id" column, then it should process the rows', async () => {
      const mockBuffer = Buffer.from('mock data');
      jest.spyOn(XLSX, 'read').mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      });
      jest
        .spyOn(XLSX.utils, 'sheet_to_json')
        .mockReturnValue([{ 'order-id': 'pi_valid_1' }, { 'order-id': 'pi_valid_2' }]);

      jest.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue({
        status: 'succeeded',
        latest_charge: { refunded: false },
        lastResponse: { headers: {}, requestId: 'req_mock', statusCode: 200 },
      } as unknown as Stripe.Response<Stripe.PaymentIntent>);

      const results = await processUploadedFile(mockBuffer, stripe, mockLog);

      expect(results).toEqual([
        { orderId: 'pi_valid_1', type: 'payment_intent', refunded: false },
        { orderId: 'pi_valid_2', type: 'payment_intent', refunded: false },
      ]);
    });
  });
});
