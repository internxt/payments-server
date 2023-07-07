import axios from 'axios';
import { FastifyLoggerInstance } from 'fastify';
import Stripe from 'stripe';
import { type AppConfig } from '../config';
import CacheService from '../services/CacheService';
import { PaymentService } from '../services/PaymentService';
import { UsersService } from '../services/UsersService';

export default async function handleSetupIntentCompleted(
  session: Stripe.SetupIntent,
  usersService: UsersService,
  paymentService: PaymentService,
  log: FastifyLoggerInstance,
  cacheService: CacheService,
  config: AppConfig,
  customerId: string,
): Promise<void> {
  if (session.status !== 'succeeded') {
    log.info(`Checkout processed without action, ${session.metadata?.email} has not paid successfully`);
    return;
  }

  if (!session.metadata?.priceId) {
    log.error(`Checkout session completed does not contain price, customer: ${session.metadata?.email}`);
    return;
  }

  if (!session.metadata.space) {
    log.error(
      `Checkout session completed with a price without maxSpaceBytes as metadata. customer: ${session.metadata?.email}`,
    );
    return;
  }

  const { space } = session.metadata;

  const customer = await paymentService.getCustomer(customerId);

  if (customer.deleted) {
    log.error(
      `Customer object could not be retrieved in checkout session completed handler with id ${session.customer}`,
    );
    return;
  }

  let user: { uuid: string };
  try {
    const res = await createOrUpdateUser(space, customer.email as string, config);
    user = res.data.user;
  } catch (err) {
    log.error(
      `Error while creating or updating user in checkout session completed handler, email: ${session.metadata?.email}`,
    );
    log.error(err);

    throw err;
  }

  try {
    await usersService.findUserByUuid(user.uuid);
  } catch {
    await usersService.insertUser({
      customerId: customer.id,
      uuid: user.uuid,
      lifetime: session.metadata.interval === 'lifetime',
    });
  }
  try {
    await cacheService.clearSubscription(customer.id);
  } catch (err) {
    log.error(`Error in handleCheckoutSessionCompleted after trying to clear ${customer.id} subscription`);
  }
}

function createOrUpdateUser(maxSpaceBytes: string, email: string, config: AppConfig) {
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
