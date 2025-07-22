import Stripe from 'stripe';
import { DetermineLifetimeConditions } from '../../../core/users/DetermineLifetimeConditions';
import { FastifyBaseLogger } from 'fastify';
import { PaymentService } from '../../../services/payment.service';
import { User } from '../../../core/users/User';
import { ObjectStorageWebhookHandler } from '../ObjectStorageWebhookHandler';
import { TiersService } from '../../../services/tiers.service';
import { UserNotFoundError, UsersService } from '../../../services/users.service';
import { StorageService } from '../../../services/storage.service';
import { NotFoundError } from '../../../errors/Errors';
import CacheService from '../../../services/cache.service';
import { Tier } from '../../../core/users/Tier';

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
        this.logger.warn(
          `Failed to find user by email ${customerEmail} and customer ID ${customerId}. Error: ${error}`,
        );
      }
    }

    // Try to find the user from the Local DB
    try {
      const userByCustomerId = await this.usersService.findUserByCustomerID(customerId);
      if (userByCustomerId) {
        return { uuid: userByCustomerId.uuid };
      }
    } catch (error) {
      this.logger.warn(`Failed to find user by email ${customerEmail} and customer ID ${customerId}. Error: ${error}`);
    }

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
      if (error instanceof UserNotFoundError) {
        return this.usersService.insertUser({
          customerId,
          uuid: userUuid,
          lifetime: isLifetimePlan,
        });
      }

      throw error;
    }
  }

  /**
   * Handle the case where the user has an old product and has purchased a new one.
   * This will update the user's storage with the new max space bytes.
   * @param userUuid The uuid of the user
   * @param maxSpaceBytes The new max space bytes
   */
  private handleOldProduct(userUuid: string, maxSpaceBytes: number): Promise<void> {
    return this.storageService.changeStorage(userUuid, maxSpaceBytes);
  }

  /**
   * Handles the processing of a new product for a user, applying the necessary features
   * and determining lifetime conditions if applicable.
   *
   * This function checks if the product is a lifetime plan and adjusts the user's tier
   * and max space bytes accordingly. It then applies drive and VPN features to the user
   * based on the determined tier and max space bytes.
   *
   * @param user - The user for whom the product is being processed, includes their email.
   * @param customer - The Stripe customer associated with the user.
   * @param maxSpaceBytes - The maximum storage space in bytes associated with the product.
   * @param isLifetimePlan - Boolean indicating whether the product is a lifetime plan.
   * @param productId - The ID of the product being processed.
   * @param totalQuantity - The total quantity of the product purchased.
   * @param tier - The tier associated with the product.
   * @throws Will log and throw an error if applying drive or VPN features fails.
   */
  private async handleNewProduct({
    user,
    customer,
    isLifetimePlan,
    productId,
    totalQuantity,
    tier,
  }: {
    user: User & { email: string };
    customer: Stripe.Customer;
    isLifetimePlan: boolean;
    productId: string;
    totalQuantity: number;
    tier: Tier;
  }): Promise<void> {
    let tierToApply = tier;
    let lifetimeMaxSpaceBytesToApply;
    const { email, ...userWithoutEmail } = user;
    // Determine the lifetime conditions - whether the user stacks space and the higher tier he has
    if (isLifetimePlan) {
      try {
        const { maxSpaceBytes: lifetimeMaxSpaceBytes, tier: lifetimeTier } =
          await this.determineLifetimeConditions.determine(userWithoutEmail, productId);
        tierToApply = lifetimeTier;
        lifetimeMaxSpaceBytesToApply = Number(lifetimeMaxSpaceBytes);
      } catch (error) {
        this.logger.error(
          `Failed to determine lifetime conditions for user ${user.uuid} with customerId ${customer.id}`,
          {
            error: (error as Error).message,
          },
        );
      }
    }

    // Apply Drive features
    try {
      await this.tiersService.applyDriveFeatures(
        user,
        customer,
        totalQuantity,
        tierToApply,
        this.logger,
        lifetimeMaxSpaceBytesToApply,
      );
      this.logger.info(`Drive features applied for user ${user.uuid} with customerId ${customer.id}`);
    } catch (error) {
      this.logger.error(`Failed to apply drive features for user ${user.uuid} with customerId ${customer.id}`, {
        error: (error as Error).message,
      });
      throw error;
    }

    // Apply VPN features
    try {
      await this.tiersService.applyVpnFeatures(user, tierToApply);
      this.logger.info(`VPN features applied for user ${user.uuid} with customerId ${customer.id}`);
    } catch (error) {
      this.logger.error(`Failed to apply VPN features for user ${user.uuid} with customerId ${customer.id}`, {
        error: (error as Error).message,
      });
      throw error;
    }
  }
}
