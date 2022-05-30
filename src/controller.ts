import { FastifyInstance } from 'fastify';
import { type AppConfig } from './config';
import { UsersService } from './services/UsersService';
import { PaymentService } from './services/PaymentService';

export default function (paymentService: PaymentService, usersService: UsersService, config: AppConfig) {
  return async function (fastify: FastifyInstance) {};
}
