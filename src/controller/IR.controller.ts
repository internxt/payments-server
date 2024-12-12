import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import XLSX from 'xlsx';

interface OrderCheckResult {
  orderId: string;
  type: 'payment_intent' | 'error';
  refunded?: boolean | null;
}

export async function processOrderId(
  orderId: string,
  stripe: Stripe,
  log: FastifyInstance['log'],
): Promise<OrderCheckResult> {
  try {
    if (orderId.startsWith('pi_')) {
      const paymentIntent = await stripe.paymentIntents.retrieve(orderId, {
        expand: ['latest_charge'],
      });
      const refunded = paymentIntent.status === 'succeeded' && (paymentIntent.latest_charge as Stripe.Charge).refunded;
      return {
        orderId,
        type: 'payment_intent',
        refunded,
      };
    }
    return { orderId, type: 'error' };
  } catch (error) {
    log.error(`Error processing order ID ${orderId}: ${(error as Error).message}`);
    return { orderId, type: 'error' };
  }
}

export default function (stripe: Stripe) {
  return async function (fastify: FastifyInstance) {
    fastify.post('/check-order-id', async (req, res) => {
      try {
        const file = await req.file();
        if (!file) {
          return res.status(400).send({ error: 'No file uploaded' });
        }

        const data = await file.toBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet);

        const results: OrderCheckResult[] = [];

        for (const row of jsonData) {
          for (const orderId of Object.values(row)) {
            const result = await processOrderId(orderId, stripe, fastify.log);
            results.push(result);
          }
        }

        return res.send({ results });
      } catch (error) {
        fastify.log.error(`Error processing file: ${(error as Error).message}`);
        return res.status(500).send({ error: 'Internal server error' });
      }
    });
  };
}
