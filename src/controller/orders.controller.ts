import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { processUploadedFile } from '../services/orders.service';

interface OrderCheckResult {
  orderId: string;
  type: 'payment_intent' | 'error';
  refunded?: boolean | null;
}

export default function (stripe: Stripe) {
  return async function (fastify: FastifyInstance) {
    fastify.post('/check-order-id', async (req, res) => {
      try {
        const file = await req.file();
        if (!file) {
          return res.status(400).send({ error: 'No file uploaded' });
        }

        const fileBuffer = await file.toBuffer();
        const results = await processUploadedFile(fileBuffer, stripe, fastify.log);

        return res.send({ results });
      } catch (error) {
        fastify.log.error(`Error processing file: ${(error as Error).message}`);
        return res.status(500).send({ error: 'Internal server error' });
      }
    });
  };
}
