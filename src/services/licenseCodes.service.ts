import Stripe from 'stripe';
import { LicenseCode } from '../core/users/LicenseCode';
import { LicenseCodesRepository } from '../core/users/LicenseCodeRepository';
import { User } from '../core/users/User';
import { PaymentService } from './payment.service';
import { StorageService } from './storage.service';
import { TierNotFoundError, TiersService } from './tiers.service';
import { UsersService } from './users.service';
import { FastifyBaseLogger } from 'fastify';
import { Service, Tier } from '../core/users/Tier';

type LicenseCodesServiceDeps = {
  paymentService: PaymentService;
  usersService: UsersService;
  storageService: StorageService;
  licenseCodesRepository: LicenseCodesRepository;
  tiersService: TiersService;
};

interface ApplyProductFeaturesProps {
  user: { uuid: string; email: string };
  customer: Stripe.Customer;
  logger: FastifyBaseLogger;
  maxSpaceBytes: number;
  tierProduct: Tier | null;
}

export class InvalidLicenseCodeError extends Error {
  constructor() {
    super('Invalid code provided');

    Object.setPrototypeOf(this, InvalidLicenseCodeError.prototype);
  }
}

export class LicenseCodeAlreadyAppliedError extends Error {
  constructor() {
    super('Code already applied');

    Object.setPrototypeOf(this, LicenseCodeAlreadyAppliedError.prototype);
  }
}

export class LicenseCodesService {
  private readonly paymentService: PaymentService;
  private readonly usersService: UsersService;
  private readonly storageService: StorageService;
  private readonly licenseCodesRepository: LicenseCodesRepository;
  private readonly tiersService: TiersService;

  constructor({
    paymentService,
    usersService,
    storageService,
    licenseCodesRepository,
    tiersService,
  }: LicenseCodesServiceDeps) {
    this.paymentService = paymentService;
    this.usersService = usersService;
    this.storageService = storageService;
    this.licenseCodesRepository = licenseCodesRepository;
    this.tiersService = tiersService;
  }

  async isLicenseCodeAvailable(code: LicenseCode['code'], provider: LicenseCode['provider']): Promise<boolean> {
    const licenseCode = await this.licenseCodesRepository.findOne(code, provider);

    if (licenseCode === null) {
      throw new InvalidLicenseCodeError();
    }

    if (licenseCode.redeemed) {
      throw new LicenseCodeAlreadyAppliedError();
    }

    return true;
  }

  async redeem(
    user: {
      email: string;
      uuid: User['uuid'];
      name?: string;
    },
    code: LicenseCode['code'],
    provider: LicenseCode['provider'],
    logger: FastifyBaseLogger,
  ): Promise<void> {
    const licenseCode = await this.licenseCodesRepository.findOne(code, provider);

    if (licenseCode === null) {
      throw new InvalidLicenseCodeError();
    }

    if (licenseCode.redeemed) {
      throw new LicenseCodeAlreadyAppliedError();
    }

    const maybeExistingUser = await this.usersService.findUserByUuid(user.uuid).catch(() => null);
    let customer: Stripe.Customer;

    // 1. Create or get customer from Stripe
    if (!maybeExistingUser) {
      customer = await this.paymentService.createCustomer({
        name: user.name || 'Internxt User',
        email: user.email,
      });
    } else {
      customer = (await this.paymentService.getCustomer(maybeExistingUser.customerId)) as Stripe.Customer;
    }

    // 2. Subscribe to the price referenced by the code
    const productMetadata = await this.paymentService.subscribe(customer.id, licenseCode.priceId);

    // 3. Update user accordingly
    if (!maybeExistingUser) {
      await this.usersService.insertUser({
        customerId: customer.id,
        uuid: user.uuid,
        lifetime: !productMetadata.recurring,
      });
    } else {
      await this.usersService.updateUser(maybeExistingUser.customerId, { lifetime: !productMetadata.recurring });
    }

    // 4. Apply features
    const tierProduct = await this.getTierProduct(licenseCode);

    await this.applyProductFeatures({
      user,
      customer,
      logger,
      maxSpaceBytes: productMetadata.maxSpaceBytes,
      tierProduct,
    });

    // 5. Mark code as redeemed
    await this.licenseCodesRepository.updateByCode(licenseCode.code, { redeemed: true });
  }

  async insertLicenseCode(licenseCode: LicenseCode): Promise<void> {
    await this.licenseCodesRepository.insert(licenseCode);
  }

  async getTierProduct(licenseCode: LicenseCode): Promise<Tier | null> {
    const product = await this.paymentService.getProduct(licenseCode.priceId);
    const productId = product.id;

    const tierProduct = await this.tiersService.getTierProductsByProductsId(productId).catch((error) => {
      if (error instanceof TierNotFoundError) {
        return null;
      }

      throw error;
    });

    return tierProduct;
  }

  async applyProductFeatures({
    user,
    customer,
    logger,
    maxSpaceBytes,
    tierProduct,
  }: ApplyProductFeaturesProps): Promise<void> {
    try {
      if (tierProduct) {
        await this.tiersService.applyTier(user, customer, 1, tierProduct.id, logger);

        const userId = (await this.usersService.findUserByUuid(user.uuid)).id;
        const existingTiersForUser = await this.tiersService.getTiersProductsByUserId(userId);
        const existingIndividualTier = existingTiersForUser.find(
          (tierProduct) => !tierProduct.featuresPerService[Service.Drive].workspaces.enabled,
        );

        if (existingIndividualTier) {
          await this.tiersService.updateTierToUser(userId, existingIndividualTier.id, tierProduct.id);
        } else {
          await this.tiersService.insertTierToUser(userId, tierProduct.id);
        }
      } else {
        await this.storageService.changeStorage(user.uuid, maxSpaceBytes);
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`Error while applying the product features to the user: ${user.uuid}. ERROR: ${err.message}`);
      throw error;
    }
  }
}
