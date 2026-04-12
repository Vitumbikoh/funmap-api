import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  get port(): number {
    return this.configService.get<number>('app.port', 4000);
  }

  get apiPrefix(): string {
    return this.configService.get<string>('app.apiPrefix', 'api/v1');
  }

  get jwtAccessSecret(): string {
    return this.configService.get<string>('jwt.accessSecret', 'change-me-access');
  }

  get jwtRefreshSecret(): string {
    return this.configService.get<string>('jwt.refreshSecret', 'change-me-refresh');
  }

  get jwtAccessTtl(): string {
    return this.configService.get<string>('jwt.accessTtl', '15m');
  }

  get jwtRefreshTtl(): string {
    return this.configService.get<string>('jwt.refreshTtl', '30d');
  }

  get databaseConfig() {
    return {
      host: this.configService.get<string>('database.host', 'localhost'),
      port: this.configService.get<number>('database.port', 5432),
      database: this.configService.get<string>('database.database', 'funmap'),
      username: this.configService.get<string>('database.username', 'postgres'),
      password: this.configService.get<string>('database.password', 'postgres'),
    };
  }

  get payChanguConfig() {
    return {
      baseUrl: this.configService.get<string>('paychangu.baseUrl', 'https://api.paychangu.com'),
      secretKey: this.configService.get<string>('paychangu.secretKey', ''),
      webhookSecret: this.configService.get<string>('paychangu.webhookSecret', ''),
    };
  }

  get cloudinaryConfig() {
    return {
      cloudName: this.configService.get<string>('cloudinary.cloudName', ''),
      apiKey: this.configService.get<string>('cloudinary.apiKey', ''),
      apiSecret: this.configService.get<string>('cloudinary.apiSecret', ''),
    };
  }
}

