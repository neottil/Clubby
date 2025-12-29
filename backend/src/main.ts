import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Server } from 'http';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda';
import serverless from 'serverless-http';

import { AppModule } from './app.module';

let cachedServer: Server;

async function bootstrap(): Promise<Server> {
  const app = await NestFactory.create(AppModule, new FastifyAdapter());
  await app.init();
  return app.getHttpServer();
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  // Lazy init per evitare cold start ripetuti
  if (!cachedServer) {
    cachedServer = await bootstrap();
  }

  return serverless(cachedServer)(event, context);
};
