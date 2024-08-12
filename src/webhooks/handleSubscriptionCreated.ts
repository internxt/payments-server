import Stripe from 'stripe';

import { PaymentService } from '../services/PaymentService';
import { ObjectStorageService } from '../services/ObjectStorageService';

function isProduct(product: Stripe.Product | Stripe.DeletedProduct): product is Stripe.Product {
  return (product as Stripe.Product).metadata !== undefined;
}

function isObjectStorageSubscription(item: Stripe.SubscriptionItem): boolean {
  return (
    typeof item.price?.product === 'object' &&
    isProduct(item.price?.product) &&
    !!item.price.product.metadata.type &&
    item.price.product.metadata.type === 'object-storage'
  );
}


export default async function handleSubscriptionCreated(
  subscription: Stripe.Subscription,
  paymentService: PaymentService,
  objectStorageService: ObjectStorageService,
): Promise<void> {
  const customerId = subscription.customer as string;
  const { items, currency } = subscription;
  const customer = await paymentService.getCustomer(customerId) as Stripe.Customer;

  if (!customer.deleted) {
    throw new Error('Customer has been deleted')
  }

  if (isObjectStorageSubscription(items.data[0])) {
    if (!customer.email) {
      throw new Error('Missing customer email on subscription created');
    }

    const paymentMethodId = subscription.default_payment_method as string;

    if (!paymentMethodId) {
      throw new Error('No default payment method has been set')
    }


    await objectStorageService.initObjectStorageUser({
      email: customer.email,
      currency,
      customerId: customer.id,
      paymentMethodId,
    })
  }
}
