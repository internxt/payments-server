import Stripe from 'stripe';
import { User } from '../core/users/User';
import { UsersRepository } from '../core/users/UsersRepository';
import { PaymentService } from './PaymentService';
import { DisplayBillingRepository } from '../core/users/MongoDBDisplayBillingRepository';

export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository, 
    private readonly paymentService: PaymentService,
    private readonly displayBillingRepository: DisplayBillingRepository
  ) {}

  async updateUser(customerId: User['customerId'], body: Pick<User, 'lifetime'>): Promise<void> {
    const updated = this.usersRepository.updateUser(customerId, body);
    if (!updated) {
      throw new UserNotFoundError();
    }
  }

  async findUserByCustomerID(customerId: User['customerId']): Promise<User> {
    const userFound = await this.usersRepository.findUserByCustomerId(customerId);

    if (!userFound) {
      throw new UserNotFoundError();
    }

    return userFound;
  }

  async findUserByUuid(uuid: User['uuid']): Promise<User> {
    const userFound = await this.usersRepository.findUserByUuid(uuid);
    if (!userFound) {
      throw new UserNotFoundError();
    }

    return userFound;
  }

  async cancelUserTeamsSubscriptions(uuid: User['uuid'], teamsUserUuid: User['uuid']) {
    const user = await this.findUserByUuid(uuid);
    const activeSubscriptions = await this.paymentService.getActiveSubscriptions(user.customerId);

    if (activeSubscriptions.length === 0) {
      throw new Error('Subscriptions not found');
    }

    const subscriptionsToCancel = activeSubscriptions.filter((subscription) => {
      const isTeams = parseInt(subscription.items.data[0].price.metadata.is_teams);

      return isTeams === 1;
    }) as Stripe.Subscription[];

    for (const subscriptionToCancel of subscriptionsToCancel) {
      await this.paymentService.cancelSubscription(subscriptionToCancel.id);
    }
  }

  async cancelUserIndividualSubscriptions(customerId: User['customerId']): Promise<void> {
    const activeSubscriptions = await this.paymentService.getActiveSubscriptions(customerId);

    if (activeSubscriptions.length === 0) {
      throw new Error('Subscriptions not found');
    }

    const individualSubscriptions = activeSubscriptions.filter(
      (subscription) => subscription.metadata.is_teams !== '1',
    ) as Stripe.Subscription[];

    for (const subscriptionToCancel of individualSubscriptions) {
      await this.paymentService.cancelSubscription(subscriptionToCancel.id);
    }
  }

  async shouldDisplayBilling(): Promise<boolean> {
    const billing = await this.displayBillingRepository.find();

    return billing.display;
  }

  insertUser(user: User) {
    return this.usersRepository.insertUser(user);
  }
}

export class UserNotFoundError extends Error {}
