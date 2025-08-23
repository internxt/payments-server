import Stripe from 'stripe';
import { DetermineLifetimeConditions } from '../../../core/users/DetermineLifetimeConditions';
import { FastifyBaseLogger } from 'fastify';
import { PaymentService, PriceMetadata } from '../../../services/payment.service';
import { User, UserType } from '../../../core/users/User';
import { ObjectStorageWebhookHandler } from '../ObjectStorageWebhookHandler';
import { TierNotFoundError, TiersService } from '../../../services/tiers.service';
import { UserNotFoundError, CouponNotBeingTrackedError, UsersService } from '../../../services/users.service';
import { StorageService } from '../../../services/storage.service';
import { NotFoundError } from '../../../errors/Errors';
import CacheService from '../../../services/cache.service';
import { Service, Tier } from '../../../core/users/Tier';
import Logger from '../../../Logger';

export interface InvoiceCompletedHandlerPayload {
  customer: Stripe.Customer;
  invoice: Stripe.Invoice;
  status: string;
}

export class InvoiceCompletedHandler {
  private readonly logger: FastifyBaseLogger;
  private readonly determineLifetimeConditions: DetermineLifetimeConditions;
  private readonly objectStorageWebhookHandler: ObjectStorageWebhookHandler;
  private readonly paymentService: PaymentService;
  private readonly storageService: StorageService;
  private readonly tiersService: TiersService;
  private readonly usersService: UsersService;
  private readonly cacheService: CacheService;

  constructor({
    logger,
    determineLifetimeConditions,
    objectStorageWebhookHandler,
    paymentService,
    storageService,
    tiersService,
    usersService,
    cacheService,
  }: {
    logger: FastifyBaseLogger;
    determineLifetimeConditions: DetermineLifetimeConditions;
    objectStorageWebhookHandler: ObjectStorageWebhookHandler;
    paymentService: PaymentService;
    storageService: StorageService;
    tiersService: TiersService;
    usersService: UsersService;
    cacheService: CacheService;
  }) {
    this.logger = logger;
    this.determineLifetimeConditions = determineLifetimeConditions;
    this.objectStorageWebhookHandler = objectStorageWebhookHandler;
    this.paymentService = paymentService;
    this.storageService = storageService;
    this.tiersService = tiersService;
    this.usersService = usersService;
    this.cacheService = cacheService;
  }

  /**
   * Process a completed invoice.
   *
   * @param payload - The webhook payload, with the customer, invoice, and status.
   * @returns A promise that resolves when the invoice has been processed.
   */
  async run(payload: InvoiceCompletedHandlerPayload): Promise<void> {
    const { customer, invoice, status: invoiceStatus } = payload;
    const invoiceId = invoice.id as string;
    const customerId = customer.id;
    const customerEmail = customer.email;
    const isInvoicePaid = invoiceStatus === 'paid';

    Logger.info(`Processing invoice ${invoiceId} for customer ${customerId}...`);

    if (!isInvoicePaid) {
      Logger.info(`Invoice ${invoiceId} not paid, skipping processing`);
      return;
    }

    if (!invoiceId) {
      throw new NotFoundError(`There is no invoice ID in the invoice ${invoiceId}. Customer ID: ${customerId}`);
    }

    const items = await this.paymentService.getInvoiceLineItems(invoiceId);
    const totalQuantity = items.data[0].quantity ?? 1;
    const priceId = items.data?.[0].pricing?.price_details?.price as string;
    const productId = items.data?.[0].pricing?.price_details?.product as string;

    if (!priceId || !productId) {
      throw new NotFoundError(
        `There is no price ID or product Id in the invoice ${invoiceId}. Customer ID: ${customerId}`,
      );
    }

    const price = await this.paymentService.getPrice(priceId);
    const product = await this.paymentService.getProduct(productId);

    const { maxSpaceBytes, planType, productType } = this.getPriceData(price, product);

    const isLifetimePlan = planType === 'one_time';
    const isBusinessPlan = productType === UserType.Business;
    const isObjStoragePlan = productType === UserType.ObjectStorage;

    if (isObjStoragePlan) {
      Logger.info(`Invoice ${invoiceId} is for object storage, reactivating account if needed...`);
      return this.objectStorageWebhookHandler.reactivateObjectStorageAccount(customer, invoice);
    }

    const tierBillingType = isLifetimePlan ? 'lifetime' : 'subscription';
    const tier = await this.tiersService.getTierProductsByProductsId(productId, tierBillingType).catch((err) => {
      if (err instanceof TierNotFoundError) {
        return null;
      }

      throw err;
    });

    const isOldProduct = !tier;
    const email = customer.email ?? customerEmail;

    const { uuid: userUuid } = await this.getUserUuid(customerId, email);

    Logger.info(
      `Tier with product ID ${tier?.productId} found to apply it to the user with customer ID: ${customerId} and User id: ${userUuid}`,
    );

    await this.updateOrInsertUser({ customerId: customer.id, userUuid, isLifetimePlan, isBusinessPlan });

    Logger.info(
      `User with customer ID ${customer.id} and user id: ${userUuid} inserted/updated successfully in the Users collection`,
    );

    if (isOldProduct) {
      await this.handleOldProduct(userUuid, Number(maxSpaceBytes));
      Logger.info(
        `Old product handled successfully for user with customer Id: ${customerId} and uuid: ${userUuid}. Storage of ${maxSpaceBytes} applied`,
      );
    } else {
      const localUser = await this.usersService.findUserByUuid(userUuid);

      await this.handleNewProduct({
        user: { ...localUser, email: email as string },
        isLifetimePlan,
        productId,
        customer,
        tier,
        totalQuantity: totalQuantity,
      });

      await this.updateOrInsertUserTier({
        isBusinessPlan,
        userId: localUser.id,
        newTier: tier,
      });

      Logger.info(
        `New tier with ID ${tier.id} and product with ID ${tier.productId} handled successfully for user with customer Id: ${customerId} and uuid: ${userUuid}`,
      );
    }

    await this.handleUserCouponRelationship({
      userUuid,
      invoiceLineItem: items.data[0],
    });

    await this.clearUserRelatedCache(customerId, userUuid);

    Logger.info(`Invoice ${invoiceId} processed successfully for user ${userUuid}`);
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
        Logger.warn(`Failed to find user by email ${customerEmail} and customer ID ${customerId}. Error: ${error}`);
      }
    }

    // Try to find the user from the Local DB
    try {
      const userByCustomerId = await this.usersService.findUserByCustomerID(customerId);
      if (userByCustomerId) {
        return { uuid: userByCustomerId.uuid };
      }
    } catch (error) {
      Logger.warn(`Failed to find user by email ${customerEmail} and customer ID ${customerId}. Error: ${error}`);
    }

    throw new NotFoundError(`User with email ${customerEmail} and customer ID ${customerId} not found`);
  }

  private getPriceData(
    price: Stripe.Price,
    product: Stripe.Product,
  ): {
    productType: string;
    planType: string;
    maxSpaceBytes: string;
  } {
    const productType = product.metadata?.type;
    const metadata = price.metadata as PriceMetadata;
    const planType = metadata?.planType;
    const maxSpaceBytes = metadata?.maxSpaceBytes;

    return {
      productType,
      planType,
      maxSpaceBytes,
    };
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
        Logger.error(`Failed to determine lifetime conditions for user ${user.uuid} with customerId ${customer.id}`, {
          error: (error as Error).message,
        });
      }
    }

    Logger.info(
      `Applying new features from the tier ${tierToApply.productId} for user ${customer.id} and user id: ${user.id}`,
    );

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
      Logger.info(`Drive features applied for user ${user.uuid} with customerId ${customer.id}`);
    } catch (error) {
      Logger.error(`Failed to apply drive features for user ${user.uuid} with customerId ${customer.id}`, {
        error: (error as Error).message,
      });
      throw error;
    }

    // Apply VPN features
    try {
      await this.tiersService.applyVpnFeatures(user, tierToApply);
      Logger.info(`VPN features applied for user ${user.uuid} with customerId ${customer.id}`);
    } catch (error) {
      Logger.error(`Failed to apply VPN features for user ${user.uuid} with customerId ${customer.id}`, {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Updates or inserts a new user-tier relationship in the database.
   *
   * @param {object} options - Options to update or insert a user-tier relationship.
   * @param {number} options.userId - The ID of the user.
   * @param {number} options.tierId - The ID of the tier.
   * @param {boolean} options.isBusinessPlan - Whether the user has a business plan.
   * @returns {Promise<void>} Resolves when the user-tier relationship has been updated or inserted.
   */
  private async updateOrInsertUserTier({
    userId,
    newTier,
    isBusinessPlan,
  }: {
    userId: User['id'];
    newTier: Tier;
    isBusinessPlan: boolean;
  }): Promise<void> {
    const { id: tierId, billingType: newBillingType } = newTier;
    try {
      let userTiers: Tier[];

      try {
        userTiers = await this.tiersService.getTiersProductsByUserId(userId);
      } catch (error) {
        if (error instanceof TierNotFoundError) {
          userTiers = [];
        } else {
          throw error;
        }
      }

      const userAlreadyHasIndividualPlan = userTiers.find((userTier) => {
        return !userTier.featuresPerService[Service.Drive].workspaces.enabled;
      });
      const userAlreadyHasWorkspace = userTiers.find((userTier) => {
        return userTier.featuresPerService[Service.Drive].workspaces.enabled;
      });

      const existingTier = isBusinessPlan ? userAlreadyHasWorkspace : userAlreadyHasIndividualPlan;

      if (!existingTier) {
        await this.tiersService.insertTierToUser(userId, tierId);
        return;
      }

      const existingBillingType = existingTier.billingType;
      const isBillingTypeDifferent = existingBillingType !== newBillingType;

      const existingMaxSpace = Number(existingTier.featuresPerService[Service.Drive].maxSpaceBytes ?? 0);
      const newMaxSpace = Number(newTier.featuresPerService[Service.Drive].maxSpaceBytes ?? 0);

      const isLifetimePlan = newBillingType === 'lifetime' && existingTier.billingType === 'lifetime';
      const isADifferentTier = existingTier.id !== tierId;

      const shouldUpdateUserTier =
        isBillingTypeDifferent ||
        (isLifetimePlan && isADifferentTier && newMaxSpace > existingMaxSpace) ||
        (!isLifetimePlan && isADifferentTier);

      if (shouldUpdateUserTier) {
        await this.tiersService.updateTierToUser(userId, existingTier.id, tierId);
        return;
      }

      Logger.debug(`User ${userId} already has tier ${tierId}. No update required.`);
    } catch (error) {
      Logger.error(`Error while updating or inserting the user-tier relationship. Error: ${error}`);
      throw error;
    }
  }

  /**
   * Handle the relationship between the user and the coupon.
   * If the invoice has a discount that we track internally and the coupon is not the free trial one,
   * store the coupon id in the user's `usedCoupons` field.
   * @param userUuid The uuid of the user
   * @param invoice The invoice where the discount is applied
   * @param invoiceLineItem The invoice line item which has the discount
   * @param isLifetimePlan Whether the invoice is for a lifetime plan
   */
  private async handleUserCouponRelationship({
    userUuid,
    invoiceLineItem,
  }: {
    userUuid: string;
    invoiceLineItem: Stripe.InvoiceLineItem;
  }): Promise<void> {
    try {
      const userData = await this.usersService.findUserByUuid(userUuid);

      const areDiscounts = invoiceLineItem.discounts.length > 0;
      if (areDiscounts) {
        const coupon = (invoiceLineItem.discounts[0] as Stripe.Discount).coupon;

        if (coupon) {
          await this.usersService.storeCouponUsedByUser(userData, coupon.id);
        }
      }
    } catch (err) {
      const error = err as Error;
      if (!(err instanceof CouponNotBeingTrackedError)) {
        Logger.error(`Error while adding user ${userUuid} and coupon: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Clears the cache for a user, both the subscription and the used promo codes.
   * @param customerId The Stripe customer Id
   * @param userUuid The uuid of the user
   */
  private async clearUserRelatedCache(customerId: string, userUuid: string): Promise<void> {
    try {
      await this.cacheService.clearSubscription(customerId);
      await this.cacheService.clearUsedUserPromoCodes(userUuid);
      Logger.info(`Cache for user with uuid: ${userUuid} and customer Id: ${customerId} has been cleaned`);
    } catch (err) {
      const error = err as Error;
      Logger.error(
        `Error while trying to clear the cache in invoice completed handler for the customer ${customerId}. Error: ${error.message}`,
      );
      throw error;
    }
  }
}
