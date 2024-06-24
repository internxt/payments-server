import Stripe from 'stripe';
import { PaymentService } from '../services/PaymentService';

export default async function handlePaymentMethodAttached(
  paymentService: PaymentService,
  paymentMethod: Stripe.PaymentMethod,  
): Promise<void> {
  const customerId = paymentMethod.customer as string;
  const type = paymentMethod.metadata?.type === 'business' ? 'business' : 'individual';
  await paymentService.updateSubscriptionPaymentMethod(customerId, paymentMethod.id, type);
}
