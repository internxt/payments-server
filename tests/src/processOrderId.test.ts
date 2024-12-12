import Stripe from 'stripe';
import { FastifyBaseLogger } from 'fastify';
import { processOrderId } from '../../src/controller/IR.controller';

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      retrieve: jest.fn(),
    },
  }));
});

const mockLog = {
  error: jest.fn(),
} as unknown as FastifyBaseLogger;

describe('processOrderId', () => {
  let stripe: jest.Mocked<Stripe>;

  beforeEach(() => {
    stripe = new Stripe('fake-key', { apiVersion: '2024-04-10' }) as jest.Mocked<Stripe>;
    jest.clearAllMocks();
  });

  it('should process a valid payment intent and check for refund', async () => {
    const mockPaymentIntent = {
      status: 'succeeded',
      latest_charge: { refunded: true },
    };

    (stripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue(mockPaymentIntent as any);

    const result = await processOrderId('pi_valid', stripe, mockLog);
    expect(result).toEqual({
      orderId: 'pi_valid',
      type: 'payment_intent',
      refunded: true,
    });
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_valid', {
      expand: ['latest_charge'],
    });
  });

  it('should handle errors during processing', async () => {
    (stripe.paymentIntents.retrieve as jest.Mock).mockRejectedValue(new Error('Stripe error'));

    const result = await processOrderId('pi_invalid', stripe, mockLog);
    expect(result).toEqual({
      orderId: 'pi_invalid',
      type: 'error',
    });
    expect(mockLog.error).toHaveBeenCalledWith('Error processing order ID pi_invalid: Stripe error');
  });

  it('should return error for non-payment intent IDs', async () => {
    const result = await processOrderId('invalid_id', stripe, mockLog);
    expect(result).toEqual({
      orderId: 'invalid_id',
      type: 'error',
    });
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });
});
