import { FastifyReply, FastifyRequest } from 'fastify';
import { User } from '../core/users/User';
import { UserNotFoundError, UsersService } from '../services/users.service';

export async function assertUser(req: FastifyRequest, rep: FastifyReply, usersService: UsersService): Promise<User> {
  const { uuid } = req.user.payload;
  try {
    return await usersService.findUserByUuid(uuid);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      req.log.info(`User with uuid ${uuid} was not found`);
      return rep.status(404).send({ message: 'User not found' });
    }
    throw err;
  }
}
