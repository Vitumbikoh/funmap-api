import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppConfigService } from '../config/app-config.service';

export function databaseConfigFactory(
  configService: AppConfigService,
): TypeOrmModuleOptions {
  const database = configService.databaseConfig;

  return {
    type: 'postgres',
    host: database.host,
    port: database.port,
    username: database.username,
    password: database.password,
    database: database.database,
    autoLoadEntities: true,
    synchronize: database.synchronize,
    logging: false,
  };
}

