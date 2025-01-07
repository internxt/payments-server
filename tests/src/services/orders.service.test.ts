import Stripe from 'stripe';
import XLSX from 'xlsx';
import { FastifyBaseLogger } from 'fastify';
import { processOrderId, processUploadedFile } from '../../../src/services/orders.service';
import { Chance } from 'chance';
import { BadRequestError, InternalServerError } from '../../../src/custom-errors';

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

describe('orders.service', () => {
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

    it('When the Stripe API fails, then it should throw InternalServerError', async () => {
      const orderId = `pi_${chance.string({ length: 10 })}`;
      (stripe.paymentIntents.retrieve as jest.Mock).mockRejectedValue(new Error('Stripe API error'));

      await expect(processOrderId(orderId, stripe, mockLog)).rejects.toThrow(InternalServerError);
      expect(mockLog.error).toHaveBeenCalledWith(`Error processing order ID ${orderId}: Stripe API error`);
    });
  });

  describe('processUploadedFile', () => {
    it('When the file has a single "order-id" column and payment intents are refunded, then it should return valid results', async () => {
      const mockBuffer = Buffer.from('mock data');
      const mockJsonData = [{ 'order-id': 'pi_valid_1' }, { 'order-id': 'pi_valid_2' }];
      jest.spyOn(XLSX, 'read').mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      });
      jest.spyOn(XLSX.utils, 'sheet_to_json').mockReturnValue(mockJsonData);

      jest.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue({
        status: 'succeeded',
        latest_charge: { refunded: true },
      } as unknown as Stripe.Response<Stripe.PaymentIntent>);

      const results = await processUploadedFile(mockBuffer, stripe, mockLog);

      expect(results).toEqual([
        { orderId: 'pi_valid_1', type: 'payment_intent', refunded: true },
        { orderId: 'pi_valid_2', type: 'payment_intent', refunded: true },
      ]);
    });

    it('When the file contains no rows, then it should return a BadRequest error', async () => {
      const mockBuffer = Buffer.from('mock data');

      jest.spyOn(XLSX, 'read').mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      });

      jest.spyOn(XLSX.utils, 'sheet_to_json').mockReturnValue([]);

      await expect(processUploadedFile(mockBuffer, stripe, mockLog)).rejects.toThrow(BadRequestError);
    });

    it('When the order ID does not start with "pi_", then it should skip it', async () => {
      const invalidOrderId = chance.string({ length: 10 });

      const result = await processOrderId(invalidOrderId, stripe, mockLog);

      expect(result).toEqual({
        orderId: invalidOrderId,
        type: 'subscription',
        refunded: null,
      });
    });

    it('When processing fails due to Stripe API, then it should throw InternalServerError', async () => {
      const mockBuffer = Buffer.from('mock data');
      const mockJsonData = [{ 'order-id': 'pi_valid_1' }];
      jest.spyOn(XLSX, 'read').mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      });
      jest.spyOn(XLSX.utils, 'sheet_to_json').mockReturnValue(mockJsonData);

      jest.spyOn(stripe.paymentIntents, 'retrieve').mockRejectedValue(new Error('Stripe API error'));

      await expect(processUploadedFile(mockBuffer, stripe, mockLog)).rejects.toThrow(InternalServerError);
    });
  });
});
