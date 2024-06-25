import { PaymentService } from '../services/PaymentService';

export default async function handleSubscriptionCanceled(
  paymentService: PaymentService,
  customerId: string,
  paymentMethodId: string,
): Promise<void> {
  await paymentService.updateSubscriptionPaymentMethod(customerId, paymentMethodId);
}
