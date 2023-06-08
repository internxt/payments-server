import { LicenseCode } from '../core/users/LicenseCode';
import { LicenseCodesRepository } from '../core/users/LicenseCodeRepository';
import { User } from '../core/users/User';
import { PaymentService } from './PaymentService';
import { StorageService } from './StorageService';
import { UsersService } from './UsersService';

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
  constructor(
    private readonly paymentService: PaymentService,
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
    private readonly licenseCodesRepository: LicenseCodesRepository
  ) {}

  async redeem(
    user: {
      email: string, 
      uuid: User['uuid'],
      name?: string,
    },
    code: LicenseCode['code'],
    provider: LicenseCode['provider'],
  ): Promise<void> {
    const licenseCode = await this.licenseCodesRepository.findOne(
      code, 
      provider
    );

    if (licenseCode === null) {
      throw new InvalidLicenseCodeError();
    }

    if (licenseCode.redeemed) {
      throw new LicenseCodeAlreadyAppliedError();
    }

    const maybeExistingUser = await this.usersService.findUserByUuid(user.uuid).catch(() => null);
    let customerId: string;

    // 1. Create or get customer from Stripe
    if (!maybeExistingUser) {
      customerId = (await this.paymentService.createCustomer({ 
        name: user.name || 'Internxt User',
        email: user.email,
      })).id;
    } else {
      customerId = (await this.paymentService.getCustomer(maybeExistingUser.customerId)).id;
    }
    
    // 2. Subscribe to the price referenced by the code
    const productMetadata = await this.paymentService.subscribe(
      customerId,
      licenseCode.priceId,
    ); 

    // 3. Set the storage referenced by the code
    await this.storageService.changeStorage(user.uuid, productMetadata.maxSpaceBytes);  
 
    // 4. Update user accordingly
    if (!maybeExistingUser) {
      await this.usersService.insertUser({
        customerId,
        uuid: user.uuid,
        lifetime: !productMetadata.recurring,
      });
    } else {
      await this.usersService.updateUser(maybeExistingUser.customerId, { lifetime: !productMetadata.recurring });
    }

    // 5. Mark code as redeemed
    await this.licenseCodesRepository.updateByCode(licenseCode.code, { redeemed: true });
  }

  async insertLicenseCode(licenseCode: LicenseCode): Promise<void> {
    await this.licenseCodesRepository.insert(licenseCode);
  }
}
