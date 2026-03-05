// main.ts (Backend)
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Habilitar CORS
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Las URLs de tu Next.js
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(3000); // Asegúrate de que este sea el puerto que usa Axios en el front
}
bootstrap();