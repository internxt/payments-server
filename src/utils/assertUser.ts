import { FastifyReply, FastifyRequest } from 'fastify';
import { User } from '../core/users/User';
import { UsersService } from '../services/users.service';

export async function assertUser(req: FastifyRequest, rep: FastifyReply, usersService: UsersService): Promise<User> {
  const { uuid } = req.user.payload;
  return usersService.findUserByUuid(uuid);
}
