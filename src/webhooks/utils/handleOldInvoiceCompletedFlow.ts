import Stripe from 'stripe';
import { AppConfig } from '../../config';
import { createOrUpdateUser, updateUserTier } from '../../services/storage.service';
import { FastifyBaseLogger } from 'fastify';
import { User } from '../../core/users/User';
import { UsersService } from '../../services/users.service';
import { NoSubscriptionSeatsProvidedError } from '../../services/tiers.service';

interface HandleOldInvoiceCompletedFlowProps {
  maxSpaceBytes: string;
  userUuid: User['uuid'];
  isBusinessPlan: boolean;
  subscriptionSeats: number | null;
  customer: Stripe.Customer;
  config: AppConfig;
  product: Stripe.Product;
  usersService: UsersService;
  log: FastifyBaseLogger;
}

export const handleOldInvoiceCompletedFlow = async ({
  maxSpaceBytes,
  isBusinessPlan,
  usersService,
  userUuid,
  subscriptionSeats,
  customer,
  config,
  product,
  log,
}: HandleOldInvoiceCompletedFlowProps) => {
  if (isBusinessPlan) {
    if (!subscriptionSeats)
      throw new NoSubscriptionSeatsProvidedError('The amount of seats is not allowed for this type of subscription');

    const address = customer.address?.line1 ?? undefined;
    const phoneNumber = customer.phone ?? undefined;

    try {
      await usersService.updateWorkspaceStorage(userUuid, Number(maxSpaceBytes), subscriptionSeats);
      log.info(
        `USER WITH CUSTOMER ID: ${customer.id} - UUID: ${userUuid} - EMAIL: ${
          customer.email
        } HAS BEEN UPDATED HIS WORKSPACE`,
      );
    } catch (err) {
      const error = err as Error;
      const statusCode = (err as any)?.response.status;

      if (!statusCode || statusCode !== 404) {
        log.error(`[ERROR UPDATING WORKSPACE]: ${error.stack ?? error.message}`);
        throw err;
      }

      log.info(
        `USER WITH CUSTOMER ID: ${customer.id} - UUID: ${userUuid} - EMAIL: ${
          customer.email
        } DOES NOT HAVE ANY WORKSPACE TO UPDATE, CREATING A NEW ONE`,
      );
      await usersService.initializeWorkspace(userUuid, {
        newStorageBytes: Number(maxSpaceBytes),
        seats: subscriptionSeats,
        address,
        phoneNumber,
      });
    }

    return;
  }

  await createOrUpdateUser(maxSpaceBytes.toString(), customer.email as string, config);

  try {
    await updateUserTier(userUuid, product.id, config);
  } catch (err) {
    log.error(`Error while updating user tier: email: ${customer.email}, planId: ${product.id}. ERROR: ${err} `);

    throw err;
  }
};
