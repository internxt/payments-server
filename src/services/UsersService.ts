import Stripe from 'stripe';
import { FREE_PLAN_BYTES_SPACE } from '../constants';
import { UsersRepository } from '../core/users/UsersRepository';
import { PaymentService } from './PaymentService';
import { StorageService } from './StorageService';

export type User = {
  customerId: string;
  uuid: string;
};

export enum Product {
  Teams = 'teams',
  Individual = 'individual'
}

export class UsersService {
  // private readonly users: Collection<MongoUser>;
  private readonly usersRepository: UsersRepository;
  private readonly paymentService: PaymentService;
  private readonly storageService: StorageService;

  constructor(
    // mongo: MongoClient, 
    usersRepository: UsersRepository,
    paymentsService: PaymentService,
    storageService: StorageService
  ) {
    // this.users = mongo.db().collection<MongoUser>('users');
    this.usersRepository = usersRepository;
    this.paymentService = paymentsService;
    this.storageService = storageService;
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

    await this.storageService.changeStorage(teamsUserUuid, FREE_PLAN_BYTES_SPACE);
  }

  async cancelUserIndividualSubscriptions(uuid: User['uuid']): Promise<void> {
    const user = await this.findUserByUuid(uuid);
    const activeSubscriptions = await this.paymentService.getActiveSubscriptions(user.customerId);

    if (activeSubscriptions.length === 0) {
      throw new Error('Subscriptions not found');
    }

    const individualSubscriptions = activeSubscriptions.filter((subscription) => {
      const isTeams = parseInt(subscription.items.data[0].price.metadata.is_teams);

      return isTeams === 0;
    }) as Stripe.Subscription[];

    for (const subscriptionToCancel of individualSubscriptions) {
      await this.paymentService.cancelSubscription(subscriptionToCancel.id);
    }

    await this.storageService.changeStorage(uuid, FREE_PLAN_BYTES_SPACE);
  }
}

export class UserNotFoundError extends Error {}
