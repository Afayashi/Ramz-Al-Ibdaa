import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ContractsService } from './contracts/contracts.service';
import { validateEnv } from './common/env';
import { json, urlencoded } from 'express';

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create(AppModule, { bodyParser: false }   // raw body kept below for webhook HMAC);
  app.use(json({ limit: '1mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }), urlencoded({ extended: false, limit: '1mb' }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.enableShutdownHooks();
  (app.getHttpAdapter().getInstance() as any).set('trust proxy', 1);
  (app.getHttpAdapter().getInstance() as any).disable('x-powered-by');
  app.enableCors({ origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(process.env.PORT || 3000);
  if (process.env.DISABLE_SCHEDULER !== 'true') {
    const job = () => app.get(ContractsService).runDaily().then(r => console.log('[daily]', r)).catch(e => console.error('[daily]', e.message));
    setTimeout(job, 10_000); setInterval(job, 24 * 3600_000).unref();
  }
}
bootstrap();
