import axios from 'axios';
import { FastifyBaseLogger } from 'fastify';
import { TiersRepository } from '../core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../core/users/MongoDBUsersTiersRepository';
import { Service, Tier } from '../core/users/Tier';
import { User } from '../core/users/User';
import { BadRequestError } from '../errors/Errors';
import { MailService } from './mail.service';
import { StorageService } from './storage.service';
import { UsersService } from './users.service';

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

export class TiersService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tiersRepository: TiersRepository,
    private readonly usersTiersRepository: UsersTiersRepository,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
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
          // case Service.Mail:
          //   await this.removeMailFeatures(userUuid);
          break;
        default:
          // TODO;
          break;
      }
    }
  }

  async applyDriveFeatures(
    userWithEmail: { email: string; uuid: User['uuid'] },
    tier: Tier,
    customMaxSpaceBytes?: number,
  ): Promise<void> {
    const features = tier.featuresPerService[Service.Drive];

    if (features.workspaces.enabled) {
      throw new BadRequestError('Workspaces feature is not available anymore');
    }

    const maxSpaceBytes = customMaxSpaceBytes ?? features.maxSpaceBytes;

    await this.storageService.updateUserStorageAndTier(
      userWithEmail.uuid,
      maxSpaceBytes,
      tier.featuresPerService[Service.Drive].foreignTierId,
    );
  }

  async removeDriveFeatures(userUuid: User['uuid'], tier: Tier, log: FastifyBaseLogger): Promise<void> {
    const freeTier = await this.getTierProductsByProductsId('free');
    const features = tier.featuresPerService[Service.Drive];

    if (features.workspaces.enabled) {
      try {
        await this.usersService.destroyWorkspace(userUuid);
        return;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          const { status, data } = error.response;
          log.error(
            `Failed to delete workspace for user ${userUuid}. Status: ${status}, Response: ${JSON.stringify(data)}`,
          );
          throw data;
        } else {
          log.error(`Unexpected error deleting workspace for user ${userUuid}: ${error}`);
          throw error;
        }
      }
    }

    return this.storageService.updateUserStorageAndTier(
      userUuid,
      freeTier.featuresPerService[Service.Drive].maxSpaceBytes,
      freeTier.featuresPerService[Service.Drive].foreignTierId,
    );
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

  async applyMailFeatures(userWithEmail: { email: string; uuid: User['uuid'] }, tier: Tier): Promise<void> {
    const { enabled } = tier.featuresPerService[Service.Mail];

    if (enabled) {
      await this.mailService.reactivateAccount(userWithEmail.uuid);
    }
  }

  async removeMailFeatures(userUuid: User['uuid']): Promise<void> {
    await this.mailService.suspendAccount(userUuid);
  }
}
