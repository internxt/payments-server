import { TiersRepository } from '../core/users/MongoDBTiersRepository';
import { User } from '../core/users/User';
import { UsersService } from './users.service';
import { createOrUpdateUser, StorageService, updateUserTier } from './storage.service';
import { AppConfig } from '../config';
import { CustomerId, NotFoundSubscriptionError, PaymentService } from './payment.service';
import { Service, Tier } from '../core/users/Tier';
import { UsersTiersRepository } from '../core/users/MongoDBUsersTiersRepository';
import Stripe from 'stripe';
import { FREE_INDIVIDUAL_TIER, FREE_PLAN_BYTES_SPACE } from '../constants';
import { FastifyBaseLogger } from 'fastify';

export class TierNotFoundError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, TierNotFoundError.prototype);
  }
}

export class UsersTiersError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, UsersTiersError.prototype);
  }
}

export class NoSubscriptionSeatsProvidedError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, NoSubscriptionSeatsProvidedError.prototype);
  }
}

export const ALLOWED_PRODUCT_IDS_FOR_ANTIVIRUS = [
  'prod_RY24Z7Axqaz1tG',
  'prod_RY27zjzWZWuzEO',
  'prod_RY29StsWXwy8Wu',
  'prod_QRYvMG6BX0TUoU',
  'prod_QRYtuEtAKhHqIN',
];

export class TiersService {
  constructor(
    private readonly usersService: UsersService,
    private readonly paymentService: PaymentService,
    private readonly tiersRepository: TiersRepository,
    private readonly usersTiersRepository: UsersTiersRepository,
    private readonly storageService: StorageService,
    private readonly config: AppConfig,
  ) {}

  async insertTierToUser(userId: User['id'], newTierId: Tier['id']): Promise<void> {
    await this.usersTiersRepository.insertTierToUser(userId, newTierId);
  }

  async updateTierToUser(userId: User['id'], oldTierId: Tier['id'], newTierId: Tier['id']): Promise<void> {
    const updatedUserTier = await this.usersTiersRepository.updateUserTier(userId, oldTierId, newTierId);

    if (!updatedUserTier) {
      throw new UsersTiersError(
        `Error while updating the older tier ${oldTierId} to the newest tier ${newTierId} from user with Id ${userId}`,
      );
    }
  }

  async deleteTierFromUser(userId: User['id'], tierId: Tier['id']): Promise<void> {
    const deletedTierFromUser = await this.usersTiersRepository.deleteTierFromUser(userId, tierId);

    if (!deletedTierFromUser) {
      throw new UsersTiersError(`Error while deleting a tier ${tierId} from user Id ${userId}`);
    }
  }

  async getTiersProductsByUserId(userId: User['id']): Promise<Tier[]> {
    const userTiers = await this.usersTiersRepository.findTierIdByUserId(userId);

    if (userTiers.length === 0) {
      throw new TierNotFoundError(`No tiers found for user with ID: ${userId}`);
    }

    return await Promise.all(userTiers.map(async ({ tierId }) => this.getTierProductsByTierId(tierId)));
  }

  async getTierProductsByTierId(tierId: Tier['id']): Promise<Tier> {
    const tier = await this.tiersRepository.findByTierId(tierId);

    if (!tier) {
      throw new TierNotFoundError(`Tier not found with ID: ${tierId}`);
    }

    return tier;
  }

  async getTierProductsByProductsId(productId: Tier['productId'], billingType?: Tier['billingType']): Promise<Tier> {
    const query: Partial<Tier> = { productId };

    if (billingType !== undefined) {
      query.billingType = billingType;
    }

    const tier = await this.tiersRepository.findByProductId(query);

    if (!tier) {
      throw new TierNotFoundError(`Tier for product ${productId} not found`);
    }

    return tier;
  }

  // !TODO: Remove this function and use getTierProductsByProductsId() instead when we have the tiers collection
  async getAntivirusTier(
    customerId: CustomerId,
    isLifetime: boolean,
  ): Promise<{ featuresPerService: { antivirus: boolean } }> {
    let productId;
    const userSubscriptions = await this.paymentService.getActiveSubscriptions(customerId);
    const activeUserSubscription = userSubscriptions.find(
      (subscription) => subscription.status === 'active' || subscription.status === 'trialing',
    );

    if (!activeUserSubscription && !isLifetime) {
      throw new NotFoundSubscriptionError('User has no active subscriptions');
    }

    if (activeUserSubscription?.product?.id) {
      productId = activeUserSubscription?.product?.id;
    }

    if (isLifetime) {
      const activeLifetime = (await this.paymentService.getInvoicesFromUser(customerId, {})).filter(
        (invoice) => invoice.status === 'paid',
      );
      const firstInvoice = activeLifetime?.[0];
      const firstLine = firstInvoice?.lines?.data?.[0];

      if (firstLine?.price?.product) {
        productId = firstLine.price.product as string;
      }
    }

    const hasAntivirusAccess = !!(productId && ALLOWED_PRODUCT_IDS_FOR_ANTIVIRUS.includes(productId));

    return {
      featuresPerService: {
        antivirus: hasAntivirusAccess,
      },
    };
  }

  async applyTier(
    userWithEmail: { email: string; uuid: User['uuid'] },
    customer: Stripe.Customer,
    lineItem: Stripe.InvoiceLineItem,
    productId: string,
  ): Promise<void> {
    const amountOfSeats = lineItem.quantity;
    const tier = await this.tiersRepository.findByProductId({ productId });

    if (!tier) {
      throw new TierNotFoundError(`Tier for product ${productId} not found`);
    }

    for (const service of Object.keys(tier.featuresPerService)) {
      const s = service as Service;

      if (!tier.featuresPerService[s].enabled) {
        continue;
      }

      switch (s) {
        case Service.Drive:
          await this.applyDriveFeatures(userWithEmail, customer, amountOfSeats, tier);
          break;
        case Service.Vpn:
          await this.applyVpnFeatures(userWithEmail, tier);
          break;

        default:
          // TODO;
          break;
      }
    }
  }

  async removeTier(userWithEmail: User & { email: string }, productId: string, log: FastifyBaseLogger): Promise<void> {
    const tier = await this.tiersRepository.findByProductId({ productId });
    const { uuid: userUuid } = userWithEmail;

    if (!tier) {
      throw new TierNotFoundError(`Tier for product ${productId} not found`);
    }

    for (const service of Object.keys(tier.featuresPerService)) {
      const s = service as Service;

      if (!tier.featuresPerService[s].enabled) {
        continue;
      }

      switch (s) {
        case Service.Drive:
          await this.removeDriveFeatures(userUuid, tier, log);
          break;
        case Service.Vpn:
          await this.removeVPNFeatures(userUuid, tier.featuresPerService['vpn']);
          break;
        default:
          // TODO;
          break;
      }
    }
  }

  async applyDriveFeatures(
    userWithEmail: { email: string; uuid: User['uuid'] },
    customer: Stripe.Customer,
    subscriptionSeats: Stripe.InvoiceLineItem['quantity'],
    tier: Tier,
  ): Promise<void> {
    const features = tier.featuresPerService[Service.Drive];

    if (features.workspaces.enabled) {
      if (!subscriptionSeats || subscriptionSeats < features.workspaces.minimumSeats)
        throw new NoSubscriptionSeatsProvidedError('The amount of seats is not allowed for this type of subscription');

      const maxSpaceBytes = features.workspaces.maxSpaceBytesPerSeat;
      const address = customer.address?.line1 ?? undefined;
      const phoneNumber = customer.phone ?? undefined;

      try {
        await this.usersService.updateWorkspaceStorage(userWithEmail.uuid, Number(maxSpaceBytes), subscriptionSeats);
      } catch (err) {
        await this.usersService.initializeWorkspace(userWithEmail.uuid, {
          newStorageBytes: Number(maxSpaceBytes),
          seats: subscriptionSeats,
          address,
          phoneNumber,
        });
      }

      return;
    }

    const maxSpaceBytes = features.maxSpaceBytes;

    await createOrUpdateUser(maxSpaceBytes.toString(), userWithEmail.email, this.config);
    await updateUserTier(userWithEmail.uuid, tier.productId, this.config);
  }

  async removeDriveFeatures(userUuid: User['uuid'], tier: Tier, log: FastifyBaseLogger): Promise<void> {
    const features = tier.featuresPerService[Service.Drive];

    if (features.workspaces.enabled) {
      await this.usersService.destroyWorkspace(userUuid);
      return;
    }
    try {
      await updateUserTier(userUuid, FREE_INDIVIDUAL_TIER, this.config);
    } catch (error) {
      log.error(`[TIER/SUB_CANCELED]: Error while updating user tier. User Id: ${userUuid}`);
    }

    return this.storageService.changeStorage(userUuid, FREE_PLAN_BYTES_SPACE);
  }

  async applyVpnFeatures(userWithEmail: { email: string; uuid: User['uuid'] }, tier: Tier): Promise<void> {
    const { uuid } = userWithEmail;
    const { enabled, featureId } = tier.featuresPerService[Service.Vpn];

    if (enabled) {
      return this.usersService.enableVPNTier(uuid, featureId);
    }
  }

  async removeVPNFeatures(userUuid: User['uuid'], vpnFeature: Tier['featuresPerService']['vpn']) {
    const { featureId } = vpnFeature;

    await this.usersService.disableVPNTier(userUuid, featureId);
  }
}
