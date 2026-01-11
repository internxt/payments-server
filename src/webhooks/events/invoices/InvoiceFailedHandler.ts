import Stripe from 'stripe';
import { paymentAdapter } from '../../../infrastructure/payment.adapter';
import { objectStorageService } from '../../../services/objectStorage.service';
import { UsersService } from '../../../services/users.service';
import Logger from '../../../Logger';

export class InvoiceFailedHandler {
  constructor(private readonly usersService: UsersService) {}
  async run(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const objectStorageLineItem = await this.findObjectStorageProduct(invoice);

    if (objectStorageLineItem) {
      Logger.info(
        `Invoice ${invoice.id} for product ${objectStorageLineItem.price?.product as string} is an object-storage product`,
      );
      return objectStorageService.suspendAccount({ customerId });
    }

    const user = await this.usersService.findUserByCustomerID(customerId).catch(() => undefined);
    if (user) {
      Logger.info(`Drive payment failure notification sent for customer ${customerId} (user UUID: ${user.uuid})`);
      return this.usersService.notifyFailedPayment(user.uuid);
    }
  }

  async findObjectStorageProduct(invoice: Stripe.Invoice): Promise<Stripe.InvoiceLineItem | undefined> {
    for (const line of invoice.lines.data) {
      const price = line.price;
      if (!price?.product) continue;
      const productId = typeof price.product === 'string' ? price.product : price.product.id;

      const product = await paymentAdapter.getProduct(productId);
      if (this.isObjectStorageProduct(product)) return line;
    }

    return undefined;
  }

  isObjectStorageProduct(product: Stripe.Product | Stripe.DeletedProduct): product is Stripe.Product {
    return (
      (product as Stripe.Product).metadata &&
      !!(product as Stripe.Product).metadata.type &&
      (product as Stripe.Product).metadata.type === 'object-storage'
    );
  }
}
