import Stripe from 'stripe';
import { DetermineLifetimeConditions } from '../../../core/users/DetermineLifetimeConditions';
import { FastifyBaseLogger } from 'fastify';
import { PaymentService, PriceMetadata } from '../../../services/payment.service';
import { User, UserType } from '../../../core/users/User';
import { ObjectStorageWebhookHandler } from '../ObjectStorageWebhookHandler';
import { TierNotFoundError, TiersService } from '../../../services/tiers.service';
import { CouponNotBeingTrackedError, UsersService } from '../../../services/users.service';
import { StorageService } from '../../../services/storage.service';
import { NotFoundError } from '../../../errors/Errors';
import { Service, Tier } from '../../../core/users/Tier';
import CacheService from '../../../services/cache.service';

interface InvoiceData {
  customerId: string;
  customerEmail: string | null;
  invoiceId: string;
  status: string;
}

export class InvoiceCompletedHandler {
  constructor(
    private readonly logger: FastifyBaseLogger,
    private readonly determineLifetimeConditions: DetermineLifetimeConditions,
    private readonly objectStorageWebhookHandler: ObjectStorageWebhookHandler,
    private readonly paymentService: PaymentService,
    private readonly storageService: StorageService,
    private readonly tiersService: TiersService,
    private readonly usersService: UsersService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Extracts invoice data from a Stripe.Invoice object.
   *
   * @param invoice The Stripe invoice object from which to extract data.
   * @returns An InvoiceData object containing the customer ID, customer email, invoice ID, and status.
   * @throws NotFoundError if the invoice does not contain a customer.
   */
  private extractInvoiceData(invoice: Stripe.Invoice): InvoiceData {
    if (!invoice.customer) {
      throw new NotFoundError('There is no customer in the invoice');
    }

    return {
      customerId: invoice.customer as string,
      customerEmail: invoice.customer_email,
      invoiceId: invoice.id,
      status: invoice.status || '',
    };
  }

  /**
   * Tries to find the user by email or customer ID and returns the user's UUID.
   *
   * @param customerId - The Stripe customer ID.
   * @param customerEmail - The customer's email, or null if not available.
   * @returns A promise that resolves to an object containing the user's UUID.
   * @throws NotFoundError if the user is not found by email or customer ID.
   */
  private async getUserUuid(
    customerId: User['customerId'],
    customerEmail: string | null,
  ): Promise<{
    uuid: string;
  }> {
    // Try to find the user by email from the Drive Server
    if (customerEmail) {
      try {
        const userResponse = await this.usersService.findUserByEmail(customerEmail.toLowerCase());
        if (userResponse?.data) {
          return { uuid: userResponse.data.uuid };
        }
      } catch (error) {
        this.logger.warn(`Failed to find user by email ${customerEmail}. Error: ${error}`);
      }
    }

    // Try to find the user from the Local DB
    try {
      const userByCustomerId = await this.usersService.findUserByCustomerID(customerId);
      if (userByCustomerId) {
        return { uuid: userByCustomerId.uuid };
      }
    } catch (error) {
      this.logger.warn(`Failed to find user by customer ID ${customerId}. Error: ${error}`);
    }

    this.logger.error(`User not found by email ${customerEmail} or customer ID ${customerId}`);
    throw new NotFoundError(`User with email ${customerEmail} and customer ID ${customerId} not found`);
  }

  /**
   * Updates an existing user or inserts a new user based on the provided parameters.
   *
   * @param {string} params.customerId - The customer ID associated with the user.
   * @param {string} params.userUuid - The UUID of the user.
   * @param {boolean} params.isLifetimePlan - Indicates if the user is on a lifetime plan.
   * @param {boolean} params.isBusinessPlan - Indicates if the user is on a business plan.
   * @returns {Promise<void>} - A promise that resolves when the operation is complete.
   *
   * If a user with the given customer ID is found, their lifetime status is updated
   * based on the type of plan. If no user is found, a new user is inserted with the
   * provided details.
   */

  private async updateOrInsertUser({
    customerId,
    userUuid,
    isLifetimePlan,
    isBusinessPlan,
  }: {
    customerId: string;
    userUuid: string;
    isLifetimePlan: boolean;
    isBusinessPlan: boolean;
  }): Promise<void> {
    try {
      const userByCustomerId = await this.usersService.findUserByCustomerID(customerId);
      const isLifetimeCurrentSub = isBusinessPlan ? userByCustomerId.lifetime : isLifetimePlan;

      await this.usersService.updateUser(customerId, {
        lifetime: isLifetimeCurrentSub,
        uuid: userUuid,
      });
    } catch (error) {
      // Si no se puede actualizar, crear nuevo usuario
      await this.usersService.insertUser({
        customerId,
        uuid: userUuid,
        lifetime: isLifetimePlan,
      });
    }
  }

}
