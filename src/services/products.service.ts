import { Service, Tier } from '../core/users/Tier';
import { UserType } from '../core/users/User';
import { TierNotFoundError, TiersService } from './tiers.service';
import { UserNotFoundError, UsersService } from './users.service';

export class ProductsService {
  constructor(
    private readonly tiersService: TiersService,
    private readonly usersService: UsersService,
  ) {}

  async findHigherTierForUser({
    userUuid,
    ownersId,
    subscriptionType,
  }: {
    userUuid: string;
    ownersId?: string[];
    subscriptionType: UserType;
  }): Promise<Tier> {
    switch (subscriptionType) {
      case UserType.Individual: {
        const user = await this.usersService.findUserByUuid(userUuid);
        const userTiers = await this.tiersService.getTiersProductsByUserId(user.id);
        if (user.lifetime) {
          return userTiers.filter((tier) => tier.billingType === 'lifetime')[0];
        }

        return userTiers.filter((userTier) => !userTier.featuresPerService[Service.Drive].workspaces.enabled)[0];
      }

      case UserType.Business: {
        const tiers: Tier[] = [];
        if (ownersId && ownersId?.length > 0) {
          const ownerTierPromises = ownersId.map(async (ownerUuid) => {
            try {
              const owner = await this.usersService.findUserByUuid(ownerUuid);
              const ownerTiers = await this.tiersService.getTiersProductsByUserId(owner.id);

              return ownerTiers.find((tier) => tier.featuresPerService[Service.Drive].workspaces.enabled) || null;
            } catch (error) {
              if (error instanceof UserNotFoundError) return null;
              throw error;
            }
          });

          const ownerTiersResolved = await Promise.all(ownerTierPromises);
          const validOwnerTiers = ownerTiersResolved.filter((tier): tier is Tier => tier !== null);

          tiers.push(...validOwnerTiers);
        }

        if (tiers.length === 0) {
          throw new TierNotFoundError(`No tiers found for user uuid ${userUuid} or associated workspaces.`);
        }

        return [...tiers].sort(
          (a, b) =>
            b.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat -
            a.featuresPerService[Service.Drive].workspaces.maxSpaceBytesPerSeat,
        )[0];
      }

      default:
        throw new TierNotFoundError(`Tier for ${userUuid} was not found while getting user Tier`);
    }
  }
}
