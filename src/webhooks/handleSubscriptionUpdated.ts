import { FastifyLoggerInstance } from 'fastify';
import Stripe from 'stripe';
import { FREE_INDIVIDUAL_TIER, FREE_PLAN_BYTES_SPACE } from '../constants';
import CacheService from '../services/CacheService';
import { PaymentService, PriceMetadata } from '../services/PaymentService';
import { StorageService, updateUserTier } from '../services/StorageService';
import { UsersService } from '../services/UsersService';
import { AppConfig } from '../config';
import { UserType } from '../core/users/User';

function isObjectStorageProduct(meta: Stripe.Metadata): boolean {
  return !!meta && !!meta.type && meta.type === 'object-storage';
}

async function handleObjectStorageProduct(
  product: Stripe.Product,
  customer: Stripe.Customer,
  subscription: Stripe.Subscription,
  paymentsService: PaymentService,
  logger: FastifyLoggerInstance,
): Promise<void> { 
  if (customer.deleted) {
    throw new Error('Customer has been deleted');
  }

  if (subscription.items.data.length !== 1) {
    throw new Error('Unexpected items length for object storage');
  }

  if (!customer.email) {
    throw new Error('Missing customer email on subscription updated');
  }

  await paymentsService.billCardVerificationCharge(
    customer.id, 
    subscription.currency
  );

  const updatableAttributes: { 
    customer?: {
      name?: string;
    }
    tax?: {
      id: string;
      type: Stripe.TaxIdCreateParams.Type
    }
  } = {};

  if (subscription.metadata.companyName) {
    logger.info(`Updating customer ${customer.id} name to ${subscription.metadata.companyName}`);

    updatableAttributes['customer'] = {
      name: subscription.metadata.companyName,
    }
  } 
  if (subscription.metadata.companyVatId && customer.address?.country) {
    const taxIds = paymentsService.getVatIdFromCountry(customer.address.country);

    logger.info(`Updating customer ${customer.id} VAT ID to ${subscription.metadata.companyVatId}-${taxIds[0]}`);

    if (taxIds.length > 0) {
      updatableAttributes['tax'] = {
        id: subscription.metadata.companyVatId,
        type: taxIds[0]
      }
    }
  }

  await paymentsService.updateCustomer(customer.id, updatableAttributes);

  logger.info(`Customer ${customer.id} with sub ${subscription.id} has been billed successfully`);
}

export default async function handleSubscriptionUpdated(
  storageService: StorageService,
  usersService: UsersService,
  subscription: Stripe.Subscription,
  cacheService: CacheService,
  paymentService: PaymentService,
  log: FastifyLoggerInstance,
  config: AppConfig,
): Promise<void> {
  let uuid = '';
  const customerId = subscription.customer as string;
  const isSubscriptionCanceled = subscription.status === 'canceled';
  const productId = subscription.items.data[0].price.product as string;
  const product = await paymentService.getProduct(productId);
  const { metadata: productMetadata } = product;
  
  if (isObjectStorageProduct(productMetadata)) {
    if (!isSubscriptionCanceled) {
      await handleObjectStorageProduct(
        product, 
        await paymentService.getCustomer(customerId) as Stripe.Customer, 
        subscription,
        paymentService,
        log,
      );
    } else {
      // TODO: Destroy account on subscription cancelled
    }
    return;
  }

  try {
    const { uuid: userUuid, lifetime } = await usersService.findUserByCustomerID(customerId);
    uuid = userUuid;
    if (lifetime) {
      return;
    }
  } catch (error) {
    log.error(`Error in handleSubscriptionUpdated trying to fetch the customer by ID ${customerId}`);
    return;
  }

  const productType = productMetadata?.type === UserType.Business ? UserType.Business : UserType.Individual;

  try {
    await cacheService.clearSubscription(customerId, productType);
  } catch (err) {
    log.error(`Error in handleSubscriptionUpdated after trying to clear ${customerId} subscription`);
  }

  if (productType === UserType.Business) {
    if (isSubscriptionCanceled) {
      return usersService.destroyWorkspace(uuid);
    }

    const customer = await paymentService.getCustomer(customerId);
    if (customer.deleted) {
      log.error(`Customer object could not be retrieved in subscription updated handler with id ${customer.id}`);
      return;
    }
    const { maxSpaceBytes: priceMaxSpaceBytes } = subscription.items.data[0].price.metadata as PriceMetadata;
    const amountOfSeats = subscription.items.data[0]!.quantity!;

    return usersService.updateWorkspaceStorage(uuid, parseInt(priceMaxSpaceBytes), amountOfSeats);
  }

  const bytesSpace = isSubscriptionCanceled
    ? FREE_PLAN_BYTES_SPACE
    : parseInt((subscription.items.data[0].price.metadata as unknown as PriceMetadata).maxSpaceBytes);

  const planId = isSubscriptionCanceled ? FREE_INDIVIDUAL_TIER : productId;
  try {
    await updateUserTier(uuid, planId, config);
  } catch (err) {
    log.error(`Error while updating user tier: uuid: ${uuid} `);
    log.error(err);
    throw err;
  }

  return storageService.changeStorage(uuid, bytesSpace);
}
