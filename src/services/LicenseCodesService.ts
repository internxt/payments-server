import { LicenseCode } from '../core/users/LicenseCode';
import { LicenseCodesRepository } from '../core/users/LicenseCodeRepository';
import { User } from '../core/users/User';
import { PaymentService } from './PaymentService';
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
    private readonly licenseCodesRepository: LicenseCodesRepository
  ) {}

  async redeem(
    email: string,
    uuid: User['uuid'],
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

    const customer = await this.paymentService.createCustomer({ email });
    await this.paymentService.subscribe(
      customer.id,
      licenseCode.priceId,
    );
    await this.usersService.insertUser({
      customerId: customer.id,
      uuid,
      lifetime: false,
    });
  }

  async insertLicenseCode(licenseCode: LicenseCode): Promise<void> {
    await this.licenseCodesRepository.insert(licenseCode);
  }
}
