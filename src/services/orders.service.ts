import Stripe from 'stripe';
import XLSX from 'xlsx';
import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { BadRequestError, CustomError, InternalServerError } from '../custom-errors';

interface OrderCheckResult {
  orderId: string;
  type: 'payment_intent' | 'subscription';
  refunded?: boolean | null;
}

export async function processOrderId(
  orderId: string,
  stripe: Stripe,
  log: FastifyInstance['log'],
): Promise<OrderCheckResult> {
  try {
    if (!orderId.startsWith('pi_')) {
      return { orderId, type: 'subscription', refunded: null };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(orderId, {
      expand: ['latest_charge'],
    });

    const refunded = paymentIntent.status === 'succeeded' && (paymentIntent.latest_charge as Stripe.Charge).refunded;

    return {
      orderId,
      type: 'payment_intent',
      refunded,
    };
  } catch (error) {
    log.error(`Error processing order ID ${orderId}: ${(error as Error).message}`);
    throw new InternalServerError(`Failed to process order ID ${orderId}. Error message: ${(error as Error).message}`);
  }
}

/**
 * Processes an uploaded Excel file to validate and retrieve refund information for Stripe orders.
 *
 * This function reads an Excel file from the provided `fileBuffer`, extracts the data from the first worksheet,
 * and validates that the file contains exactly one column with the header "order-id". It then processes each
 * order ID using the `processOrderId` function to check if the associated payment intent is refunded.
 *
 * @param {Buffer} fileBuffer - The binary content of the uploaded file.
 * @param {Stripe} stripe - An instance of the Stripe SDK for API calls.
 * @param {FastifyBaseLogger} log - The Fastify logger for logging errors and other information.
 * @returns {Promise<OrderCheckResult[]>} A promise that resolves to an array of `OrderCheckResult` objects,
 * each containing information about refunded payment intents.
 * @throws {BadRequestError} If the file does not have exactly one column with the header "order-id".
 * @throws {InternalServerError} If the file processing fails or an unexpected error occurs.
 */
export async function processUploadedFile(
  fileBuffer: Buffer,
  stripe: Stripe,
  log: FastifyBaseLogger,
): Promise<OrderCheckResult[]> {
  try {
    const workbook = XLSX.read(fileBuffer);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet);

    const keys = Object.keys(jsonData[0] || {});
    if (keys.length > 1 || !keys || keys[0]?.toLocaleLowerCase() !== 'order-id') {
      throw new BadRequestError('The file must have exactly one column with the header "order-id"');
    }

    const results: OrderCheckResult[] = [];

    for (const row of jsonData) {
      for (const orderId of Object.values(row)) {
        const result = await processOrderId(orderId, stripe, log);
        if (result.type === 'payment_intent' && result.refunded) {
          results.push(result);
        }
      }
    }

    return results;
  } catch (error) {
    log.error(`Error processing uploaded file: ${(error as Error).message}`);
    if (error instanceof CustomError) {
      throw error;
    }
    throw new InternalServerError('Failed to process uploaded file.');
  }
}
