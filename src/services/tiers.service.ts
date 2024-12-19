import { Service, Tier, TiersRepository } from "../core/users/MongoDBTiersRepository";
import { User } from "../core/users/User";
import { UsersService } from "./users.service";
import { createOrUpdateUser, updateUserTier } from './storage.service';
import { AppConfig } from "../config";

export class TiersService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tiersRepository: TiersRepository,
    private readonly config: AppConfig
  ) {}

  async applyTier(userWithEmail: User & { email: string }, productId: string): Promise<void> {
    const tier = await this.tiersRepository.findByProductId(productId);

    if (!tier) {
      throw new Error(`Tier for product ${productId} not found`);
    }
  
    for (const service of Object.keys(tier.featuresPerService)) {
      const s = service as Service;

      if (!tier.featuresPerService[s].enabled) {
        continue;
      }
  
      switch (s) {
        case Service.Drive:
          await this.applyDriveFeatures(
            userWithEmail,
            tier,
          );
          break;
        case Service.Vpn:
          await this.applyVpnFeatures(userWithEmail, tier);
          break;
        case Service.Meet:
        case Service.Mail:
        case Service.Backups:
          break;
        default:
          // TODO;
          break;
      }
    }
  }

  async applyDriveFeatures(userWithEmail: User & { email: string }, tier: Tier): Promise<void> {
    const features = tier.featuresPerService[Service.Drive];

    if (features.workspaces.enabled) {
      const maxSpaceBytes = features.workspaces.maxSpaceBytesPerSeat;
      const amountOfSeats = 0;
      const address = '';
      const phoneNumber = '';
  
      try {
        await this.usersService.updateWorkspaceStorage(userWithEmail.uuid, Number(maxSpaceBytes), amountOfSeats);
      } catch (err) {
        await this.usersService.initializeWorkspace(userWithEmail.uuid, {
          newStorageBytes: Number(maxSpaceBytes),
          seats: amountOfSeats,
          address,
          phoneNumber,
        });
      }
      
      return;
    } 
  
    const maxSpaceBytes = features.maxSpaceBytes;
  
    await createOrUpdateUser(maxSpaceBytes.toString(), userWithEmail.email as string, this.config);
    await updateUserTier(userWithEmail.uuid, tier.productId, this.config);
  }

  async applyVpnFeatures(userWithEmail: User & { email: string }, tier: Tier): Promise<void> {
    // TODO: API call to the VPN server.
    const features = tier.featuresPerService[Service.Vpn];
  }
}
