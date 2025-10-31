import Stripe from 'stripe';
import { ObjectStorageService } from '../../services/objectStorage.service';
import { PaymentService } from '../../services/payment.service';
import { AxiosError, isAxiosError } from 'axios';
import Logger from '../../Logger';

export class ObjectStorageWebhookHandler {
  constructor(
    private readonly objectStorageService: ObjectStorageService,
    private readonly paymentService: PaymentService,
  ) {}

  /**
   * Determines if the given product is an object storage product
   * @param product The product object to check
   * @returns `true` if the product is an object storage product, `false` otherwise
   */
  private isObjectStorageProduct(product: Stripe.Product | Stripe.DeletedProduct): product is Stripe.Product {
    return (
      (product as Stripe.Product).metadata &&
      !!(product as Stripe.Product).metadata.type &&
      (product as Stripe.Product).metadata.type === 'object-storage'
    );
  }

  /**
   * Apply the object storage webhook conditions
   *
   * @param customer The stripe customer object
   * @param invoice The stripe invoice object
   *
   * @remarks
   * This function will handle the object storage webhook conditions.
   * If the invoice is an object storage invoice, it will reactivate the account if it was suspended
   */
  async reactivateObjectStorageAccount(customer: Stripe.Customer, invoice: Stripe.Invoice): Promise<void> {
    if (invoice.lines.data.length !== 1) {
      Logger.info(`Invoice ${invoice.id} not handled by object-storage handler due to lines length`);
      return;
    }

    const [item] = invoice.lines.data;
    const { customer_email } = invoice;
    const productId = item.pricing?.price_details?.product;

    if (!productId) {
      Logger.info(`The price or the product for the invoice with ID ${invoice.id} are null.`);
      return;
    }

    const product = await this.paymentService.getProduct(productId as string);

    if (!this.isObjectStorageProduct(product)) {
      Logger.info(`Invoice ${invoice.id} for product ${productId as string} is not an object-storage product`);
      return;
    }

    try {
      await this.objectStorageService.reactivateAccount({ customerId: customer.id });
    } catch (error) {
      if (isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const errorStatus = axiosError.response?.status;

        if (errorStatus !== 404) {
          throw error;
        }

        Logger.info(`Object storage user ${customer_email} (customer ${customer.id}) was not found while reactivating`);
        return;
      }

      throw error;
    }

    Logger.info(
      `Object Storage user ${customer_email} (customer ${customer.id}) has been reactivated (if it was suspended)`,
    );
  }
}
