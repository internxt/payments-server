import Stripe from 'stripe';
import { LicenseCode } from '../core/users/LicenseCode';
import { LicenseCodesRepository } from '../core/users/LicenseCodeRepository';
import { User } from '../core/users/User';
import { PaymentService } from './payment.service';
import { UsersService } from './users.service';
import { FastifyBaseLogger } from 'fastify';
import { Tier } from '../core/users/Tier';

type LicenseCodesServiceDeps = {
  paymentService: PaymentService;
  usersService: UsersService;
  licenseCodesRepository: LicenseCodesRepository;
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
  private readonly licenseCodesRepository: LicenseCodesRepository;

  constructor({ paymentService, usersService, licenseCodesRepository }: LicenseCodesServiceDeps) {
    this.paymentService = paymentService;
    this.usersService = usersService;
    this.licenseCodesRepository = licenseCodesRepository;
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

  async redeem({
    user,
    code,
    provider,
  }: {
    user: {
      email: string;
      uuid: User['uuid'];
      name?: string;
    };
    code: LicenseCode['code'];
    provider: LicenseCode['provider'];
  }): Promise<void> {
    const licenseCode = await this.licenseCodesRepository.findOne(code, provider);

    if (licenseCode === null) {
      throw new InvalidLicenseCodeError();
    }

    if (licenseCode.redeemed) {
      throw new LicenseCodeAlreadyAppliedError();
    }

    const maybeExistingUser = await this.usersService.findUserByUuid(user.uuid).catch(() => null);
    let customer: Stripe.Customer;

    if (maybeExistingUser) {
      customer = (await this.paymentService.getCustomer(maybeExistingUser.customerId)) as Stripe.Customer;
    } else {
      customer = await this.paymentService.createCustomer({
        name: user.name || 'Internxt User',
        email: user.email,
      });
    }

    // Creates the subscription/invoice and marks it as paid, then triggers the webhook who apply the features
    const productMetadata = await this.paymentService.subscribe(customer.id, licenseCode.priceId, licenseCode);

    if (maybeExistingUser) {
      await this.usersService.updateUser(maybeExistingUser.customerId, { lifetime: !productMetadata.recurring });
    } else {
      await this.usersService.insertUser({
        customerId: customer.id,
        uuid: user.uuid,
        lifetime: !productMetadata.recurring,
      });
    }

    await this.licenseCodesRepository.updateByCode(licenseCode.code, { redeemed: true });
  }

  async insertLicenseCode(licenseCode: LicenseCode): Promise<void> {
    await this.licenseCodesRepository.insert(licenseCode);
  }
}
