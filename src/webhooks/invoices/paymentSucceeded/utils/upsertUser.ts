import { User } from '../../../../core/users/User';
import { UsersService } from '../../../../services/users.service';

export async function upsertUser({
  customerId,
  usersService,
  userUuid,
  isBusinessPlan,
  isLifetime,
}: {
  customerId: string;
  usersService: UsersService;
  userUuid: User['uuid'];
  isBusinessPlan: boolean;
  isLifetime: boolean;
}) {
  try {
    const userByCustomerId = await usersService.findUserByCustomerID(customerId);
    const isLifetimeCurrentSub = isBusinessPlan ? userByCustomerId.lifetime : isLifetime;
    await usersService.updateUser(customerId, {
      lifetime: isLifetimeCurrentSub,
    });
  } catch {
    await usersService.insertUser({
      customerId: customerId,
      uuid: userUuid,
      lifetime: isLifetime,
    });
  }
}
