import { User } from '../core/users/User';
import { AccountSetupPendingError, InvalidConfirmationTokenError, UserNotFoundError } from '../errors/PaymentErrors';
import { StripePaymentsAdapter } from '../infrastructure/adapters/stripe.adapter';
import { Customer, CreateCustomerParams } from '../infrastructure/domain/entities/customer';
import CacheService from './cache.service';
import { UsersService } from './users.service';

export type CheckoutCustomerDetails = Partial<Omit<CreateCustomerParams, 'email'>>;

export interface PaymentAttempt {
  email: string;
  confirmationTokenId: string;
  customerDetails: CheckoutCustomerDetails;
}

export class CheckoutCustomersService {
  constructor(
    private readonly usersService: UsersService,
    private readonly cacheService: CacheService,
    private readonly paymentsAdapter: StripePaymentsAdapter,
  ) {}

  async upsertCustomerForDriveUser(
    { uuid, email }: Pick<User, 'uuid'> & { email: string },
    customerDetails: CheckoutCustomerDetails,
  ): Promise<Customer['id']> {
    const userExists = await this.usersService.findUserByUuid(uuid).catch(() => null);

    return this.upsertCustomer(userExists, uuid, email, customerDetails);
  }

  async upsertCustomerForPaymentAttempt({
    email,
    confirmationTokenId,
    customerDetails,
  }: PaymentAttempt): Promise<Customer['id']> {
    await this.claimConfirmationToken(confirmationTokenId);

    const uuid = await this.preCreateBuyerWithoutAccount(email);
    const userExists = await this.findUserByUuidIfExists(uuid);

    return this.upsertCustomer(userExists, uuid, email, {
      ...customerDetails,
      metadata: { ...customerDetails.metadata, new_user_id: uuid },
    });
  }

  async preCreateBuyerWithoutAccount(email: string): Promise<User['uuid']> {
    const { uuid, setupPending } = await this.usersService.preCreateUser(email);

    if (setupPending) {
      throw new AccountSetupPendingError();
    }

    return uuid;
  }

  async getEmailOfBuyerWithoutAccount(customerId: Customer['id']): Promise<string> {
    const { email } = await this.paymentsAdapter.getCustomer(customerId);

    await this.preCreateBuyerWithoutAccount(email);

    return email;
  }

  private async claimConfirmationToken(confirmationTokenId: string): Promise<void> {
    const confirmationToken = await this.paymentsAdapter.getConfirmationToken(confirmationTokenId);
    if (!confirmationToken.canStartPaymentAttempt()) {
      throw new InvalidConfirmationTokenError();
    }

    const isFirstUse = await this.cacheService.markConfirmationTokenAsUsed(confirmationToken.id);
    if (!isFirstUse) {
      throw new InvalidConfirmationTokenError();
    }
  }

  private async findUserByUuidIfExists(uuid: User['uuid']): Promise<User | null> {
    try {
      return await this.usersService.findUserByUuid(uuid);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  private async upsertCustomer(
    existingUser: User | null,
    uuid: User['uuid'],
    email: string,
    customerDetails: CheckoutCustomerDetails,
  ): Promise<Customer['id']> {
    if (existingUser) {
      await this.paymentsAdapter.updateCustomer(existingUser.customerId, { ...customerDetails, email });
      return existingUser.customerId;
    }

    const { id } = await this.paymentsAdapter.createCustomer({ ...customerDetails, email });
    await this.usersService.insertUser({ customerId: id, uuid, lifetime: false });

    return id;
  }
}
