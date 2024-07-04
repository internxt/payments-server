import Stripe from 'stripe';
import { PaymentService } from '../services/PaymentService';
import { UserType } from '../core/users/User';

export default async function handleSetupIntentSucceded(
  setupIntent: Stripe.SetupIntent,
  paymentService: PaymentService,
): Promise<void> {
  const customerId = setupIntent.customer as string;
  const paymentMethodId = setupIntent.payment_method as string;
  const setupIntentMetadata = setupIntent.metadata as Stripe.Metadata;
  
  const userType = setupIntentMetadata?.userType as UserType;

  if ([UserType.Individual, UserType.Business].includes(userType)) {
    await paymentService.updateSubscriptionPaymentMethod(customerId, paymentMethodId, userType);
  }
}
