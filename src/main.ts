// //main.ts (Backend) - Versión Producción
// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { join } from 'path';
// import { NestExpressApplication } from '@nestjs/platform-express';

// async function bootstrap() {
//   const app = await NestFactory.create<NestExpressApplication>(AppModule);

//   app.useStaticAssets(join(__dirname, '..', 'uploads'), {
//     prefix: '/uploads/',
//   });

//   // Habilitar CORS
//   app.enableCors({
//     // Agregamos el origen de producción (Netlify) y mantenemos los locales para pruebas
//     origin: [
//       'http://localhost:3000', 
//       'http://localhost:3001',
//       /\.netlify\.app$/, // Permite cualquier subdominio de Netlify (muy útil)
//     ], 
//     methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
//     credentials: true,
//   });

//   // AJUSTE CLAVE: Puerto dinámico para Render
//   // Render inyecta automáticamente una variable de entorno llamada PORT
//   const port = process.env.PORT || 3000;
  
//   // Escuchamos en 0.0.0.0 para que sea accesible externamente en la nube
//   await app.listen(port, '0.0.0.0');
//   console.log(`Application is running on: ${await app.getUrl()}`);
// }
// bootstrap();



// main.ts (Backend Servidor)
// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { join } from 'path';
// import { NestExpressApplication } from '@nestjs/platform-express';

// async function bootstrap() {
//   const app = await NestFactory.create<NestExpressApplication>(AppModule);

//   app.useStaticAssets(join(__dirname, '..', 'uploads'), {
//     prefix: '/uploads/',
//   });

//   // Habilitar CORS
//   app.enableCors({
//     origin: ['http://localhost:3000', 'http://localhost:3001'], // Las URLs de tu Next.js
//     methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
//     credentials: true,
//   });

//   await app.listen(3000); // Asegúrate de que este sea el puerto que usa Axios en el front
// }
// bootstrap();



// main.ts (Backend) - Versión Render
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
    // Agregamos el origen de producción (Netlify) y mantenemos los locales para pruebas
    origin: [
      'http://localhost:3000', 
      'http://localhost:3001',
      /\.netlify\.app$/, // Permite cualquier subdominio de Netlify (muy útil)
    ], 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // AJUSTE CLAVE: Puerto dinámico para Render
  // Render inyecta automáticamente una variable de entorno llamada PORT
  const port = process.env.PORT || 3000;
  
  // Escuchamos en 0.0.0.0 para que sea accesible externamente en la nube
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();