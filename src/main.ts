import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfigService } from './shared/config/app-config.service';
import * as os from 'os';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    rawBody: true,
  });

  const config = app.get(AppConfigService);

  app.setGlobalPrefix(config.apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FunMap API')
    .setDescription('Geo-social discovery, events, and monetization platform API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = config.port || 4000;

  // ✅ ALWAYS listen on all interfaces
  await app.listen(port, '0.0.0.0');

  // ✅ Get LAN IP for logging
  const networkInterfaces = os.networkInterfaces();
  let localIp = 'localhost';

  for (const key in networkInterfaces) {
    const iface = networkInterfaces[key];
    if (!iface) continue;

    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
        break;
      }
    }
  }

  console.log(`🚀 Server running on:`);
  console.log(`👉 Local:   http://localhost:${port}/${config.apiPrefix}`);
  console.log(`👉 Network: http://${localIp}:${port}/${config.apiPrefix}`);
}

bootstrap();