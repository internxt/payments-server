import axios from 'axios';
import { FastifyLoggerInstance } from 'fastify';
import Stripe from 'stripe';
import config from '../config';
import CacheService from '../services/CacheService';
import { PaymentService, PriceMetadata } from '../services/PaymentService';
import { UsersService } from '../services/UsersService';

export default async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  usersService: UsersService,
  paymentService: PaymentService,
  log: FastifyLoggerInstance,
  cacheService: CacheService,
): Promise<void> {
  if (session.payment_status !== 'paid') {
    log.info(`Checkout processed without action, ${session.customer_email} has not paid successfully`);
    return;
  }

  const lineItems = await paymentService.getLineItems(session.id);

  const price = lineItems.data[0].price;

  if (!price) {
    log.error('Checkout session completed does not contain price');
    return;
  }

  if (price.metadata.maxSpaceBytes === undefined) {
    log.error('Checkout session completed with a price without maxSpaceBytes as metadata');
    return;
  }

  const { maxSpaceBytes } = price.metadata as PriceMetadata;

  const customer = await paymentService.getCustomer(session.customer as string);
  if (customer.deleted) {
    log.error(
      `Customer object could not be retrieved in checkout session completed handler with id ${session.customer}`,
    );
    return;
  }

  let user: { uuid: string };
  try {
    const res = await createOrUpdateUser(maxSpaceBytes, customer.email as string);
    user = res.data.user;
  } catch (err) {
    log.error('Something went wrong while creating or updating user in checkout session completed handler');
    log.error(err);
    return;
  }

  try {
    await usersService.findUserByUuid(user.uuid);
  } catch {
    await usersService.insertUser({
      customerId: customer.id,
      uuid: user.uuid,
      lifetime: (price.metadata as PriceMetadata).planType === 'one_time',
    });
  }
  try {
    await cacheService.clearSubscription(customer.id);
  } catch (err) {
    log.error(`Error in handleCheckoutSessionCompleted after trying to clear ${customer.id} subscription`);
  }
}

function createOrUpdateUser(maxSpaceBytes: string, email: string) {
  return axios.post(
    `${config.DRIVE_GATEWAY_URL}/api/gateway/user/updateOrCreate`,
    { maxSpaceBytes, email },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      auth: { username: config.DRIVE_GATEWAY_USER, password: config.DRIVE_GATEWAY_PASSWORD },
    },
  );
}
