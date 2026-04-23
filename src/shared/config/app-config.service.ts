import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  get host(): string {
    return this.configService.get<string>('app.host', '0.0.0.0');
  }

  get port(): number {
    return this.configService.get<number>('app.port', 4000);
  }

  get apiPrefix(): string {
    return this.configService.get<string>('app.apiPrefix', 'api/v1');
  }

  get funOclockDispatchIntervalMinutes(): number {
    return this.configService.get<number>('app.funOclockDispatchIntervalMinutes', 0);
  }

  get jwtAccessSecret(): string {
    return this.configService.get<string>('jwt.accessSecret', 'change-me-access');
  }

  get jwtRefreshSecret(): string {
    return this.configService.get<string>('jwt.refreshSecret', 'change-me-refresh');
  }

  get jwtAccessTtl(): StringValue {
    return this.configService.get<StringValue>('jwt.accessTtl', '1h');
  }

  get jwtRefreshTtl(): StringValue {
    return this.configService.get<StringValue>('jwt.refreshTtl', '30d');
  }

  get databaseConfig() {
    return {
      host: this.configService.get<string>('database.host', 'localhost'),
      port: this.configService.get<number>('database.port', 5432),
      database: this.configService.get<string>('database.database', 'funmap'),
      username: this.configService.get<string>('database.username', 'postgres'),
      password: this.configService.get<string>('database.password', 'postgres'),
      synchronize: this.configService.get<boolean>('database.synchronize', true),
    };
  }

  get payChanguConfig() {
    return {
      baseUrl: this.configService.get<string>('paychangu.baseUrl', 'https://api.paychangu.com'),
      secretKey: this.configService.get<string>('paychangu.secretKey', ''),
      webhookSecret: this.configService.get<string>('paychangu.webhookSecret', ''),
      webhookSignatureHeader: this.configService.get<string>(
        'paychangu.webhookSignatureHeader',
        'signature',
      ),
      paymentPath: this.configService.get<string>('paychangu.paymentPath', '/payment'),
      verifyPath: this.configService.get<string>(
        'paychangu.verifyPath',
        '/verify-payment/{tx_ref}',
      ),
      callbackUrl: this.configService.get<string>('paychangu.callbackUrl', ''),
      returnUrl: this.configService.get<string>('paychangu.returnUrl', ''),
    };
  }

  get cloudinaryConfig() {
    return {
      cloudName: this.configService.get<string>('cloudinary.cloudName', ''),
      apiKey: this.configService.get<string>('cloudinary.apiKey', ''),
      apiSecret: this.configService.get<string>('cloudinary.apiSecret', ''),
    };
  }

  get fcmConfig() {
    return {
      projectId: this.configService.get<string>('fcm.projectId', ''),
      clientEmail: this.configService.get<string>('fcm.clientEmail', ''),
      privateKey: this.configService.get<string>('fcm.privateKey', ''),
    };
  }

  get adminRegistrationSecret(): string {
    return this.configService.get<string>('admin.registrationSecret', '');
  }
}

