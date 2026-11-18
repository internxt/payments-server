import { FastifyReply, FastifyRequest } from 'fastify';
import { User } from '../core/users/User';
import { UsersService } from '../services/users.service';
import { UserNotFoundError } from '../errors/PaymentErrors';
import Logger from '../Logger';

export async function assertUser(req: FastifyRequest, rep: FastifyReply, usersService: UsersService): Promise<User> {
  const { uuid } = req.user.payload;
  try {
    return await usersService.findUserByUuid(uuid);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      Logger.info(`User with uuid ${uuid} was not found`);
      return rep.status(404).send({ message: 'User not found' });
    }
    throw err;
  }
}
