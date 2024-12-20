import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import multipart from '@fastify/multipart';
import { processUploadedFile } from '../services/orders.service';
import { BadRequestError, CustomError } from '../custom-errors';
import fastifyJwt from '@fastify/jwt';
import { AppConfig } from '../config';

const XLSX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function (stripe: Stripe, config: AppConfig) {
  return async function (fastify: FastifyInstance) {
    const publicKey = Buffer.from(config.DRIVE_GATEWAY_PUBLIC_SECRET, 'base64').toString('utf8');

    fastify.register(multipart);

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
        const file = await req.file({
          throwFileSizeLimit: true,
          limits: {
            fileSize: MAX_FILE_SIZE,
          },
        });

        if (!file) {
          throw new BadRequestError('No file provided');
        }

        file.file.on('limit', () => {
          req.log.error(`[LIMIT REACHED]`);
          return res.status(400).send('Payload too large');
        });

        const fileBuffer = await file.toBuffer();

        if (file.mimetype !== XLSX_MIMETYPE) {
          throw new BadRequestError('Invalid file type. Only XLSX files are allowed.');
        }

        const results = await processUploadedFile(fileBuffer, stripe, fastify.log);

        return res.send(results);
      } catch (error) {
        if (error instanceof CustomError || error instanceof BadRequestError) {
          req.log.error(`[ERROR WHILE PROCESSING FILE]: ${error.message}`);
          return res.status(error.statusCode).send(error.message);
        }

        req.log.error(`Error processing file: ${(error as Error).message}`);
        return res.status(500).send({ error: 'Internal server error' });
      }
    });
  };
}
