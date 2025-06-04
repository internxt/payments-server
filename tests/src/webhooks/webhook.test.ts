import { FastifyInstance } from 'fastify';
import { closeServerAndDatabase, initializeServerAndDatabase } from '../utils/initializeServer';
import Stripe from 'stripe';
import { getLogger, getPaymentIntent } from '../fixtures';
import handleFundsCaptured from '../../../src/webhooks/handleFundsCaptured';
import { PaymentService } from '../../../src/services/payment.service';
import { ObjectStorageService } from '../../../src/services/objectStorage.service';

let app: FastifyInstance;

jest.mock('../../../src/webhooks/handleFundsCaptured');

beforeAll(async () => {
  app = await initializeServerAndDatabase();
  process.env.STRIPE_WEBHOOK_KEY = 'whsec_lorim_ipsum_etc_etc';
});

afterAll(async () => {
  await closeServerAndDatabase();
});

describe('Webhook events', () => {
  describe('The webhooks are called correctly', () => {
    it('When the event payment_intent.amount_capturable_updated is triggered, then the correct function is called', async () => {
      const logger = getLogger();
      const mockedPaymentIntent = getPaymentIntent();
      const event = {
        id: 'evt_1',
        type: 'payment_intent.amount_capturable_updated',
        data: { object: mockedPaymentIntent },
      };
      const payloadToString = JSON.stringify(event);
      const secret = 'whsec_lorim_ipsum_etc_etc';

      const header = Stripe.webhooks.generateTestHeaderString({
        payload: payloadToString,
        secret,
      });

      const response = await app.inject({
        method: 'POST',
        path: 'webhook',
        body: Buffer.from(payloadToString),
        headers: {
          'stripe-signature': header,
          'content-type': 'application/json',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(handleFundsCaptured).toHaveBeenCalled();
      expect(handleFundsCaptured).toHaveBeenCalledWith(
        event.data.object,
        expect.any(PaymentService),
        expect.any(ObjectStorageService),
        expect.any(Stripe),
        app.log,
      );
    });
  });
});
