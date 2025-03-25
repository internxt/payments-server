import { Service, Tier } from '../core/users/Tier';
import { TierNotFoundError, TiersService } from './tiers.service';
import { UserNotFoundError, UsersService } from './users.service';

export class ProductsService {
  constructor(
    private readonly tiersService: TiersService,
    private readonly usersService: UsersService,
  ) {}

  async findHigherTierForUser({ userUuid, ownerId }: { userUuid: string; ownerId?: string[] }): Promise<Tier> {
    const tiers: Tier[] = [];

    try {
      const user = await this.usersService.findUserByUuid(userUuid);
      const userTiers = await this.tiersService.getTiersProductsByUserId(user.id);

      tiers.push(...userTiers);
    } catch (error) {
      if (!(error instanceof UserNotFoundError)) throw error;
    }

    if (ownerId && ownerId?.length > 0) {
      const ownerTierPromises = ownerId.map(async (ownerUuid) => {
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
      (a, b) => b.featuresPerService[Service.Drive].maxSpaceBytes - a.featuresPerService[Service.Drive].maxSpaceBytes,
    )[0];
  }
}
