import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { processUploadedFile } from '../services/orders.service';
import { BadRequestError, CustomError } from '../custom-errors';
import fastifyJwt from '@fastify/jwt';
import { AppConfig } from '../config';

const XLSX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function (stripe: Stripe, config: AppConfig) {
  return async function (fastify: FastifyInstance) {
    const publicKey = Buffer.from(config.DRIVE_GATEWAY_PUBLIC_SECRET as string, 'base64').toString('utf8');

    fastify.register(fastifyJwt, {
      secret: {
        public: publicKey,
      },
      verify: {
        algorithms: ['RS256'],
      },
    });

    fastify.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.status(401).send({ error: 'Unauthorized: Invalid token' });
      }
    });
    fastify.post('/check-order-id', async (req, res) => {
      try {
        const file = await req.file();
        if (!file || file.mimetype !== XLSX_MIMETYPE) {
          throw new BadRequestError('No XLSX file provided');
        }

        const fileBuffer = await file.toBuffer();
        const results = await processUploadedFile(fileBuffer, stripe, fastify.log);

        if (results.length === 0) {
          return res.send({ message: 'No refunds found.' });
        }

        return res.send(results);
      } catch (error) {
        if (error instanceof CustomError) {
          return res.status(error.statusCode).send({ error: error.message });
        }
        fastify.log.error(`Error processing file: ${(error as Error).message}`);
        return res.status(500).send({ error: 'Internal server error' });
      }
    });
  };
}
