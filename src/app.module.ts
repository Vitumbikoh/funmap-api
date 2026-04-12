import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { CheckinsModule } from './modules/checkins/checkins.module';
import { ChatModule } from './modules/chat/chat.module';
import { EventsModule } from './modules/events/events.module';
import { FeedModule } from './modules/feed/feed.module';
import { HealthModule } from './modules/health/health.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PostsModule } from './modules/posts/posts.module';
import { ReelsModule } from './modules/reels/reels.module';
import { UsersModule } from './modules/users/users.module';
import { AppConfigService } from './shared/config/app-config.service';
import { appConfig } from './shared/config/app.config';
import { databaseConfigFactory } from './shared/database/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: databaseConfigFactory,
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    MediaModule,
    PostsModule,
    ReelsModule,
    EventsModule,
    FeedModule,
    PaymentsModule,
    ChatModule,
    NotificationsModule,
    CheckinsModule,
  ],
  providers: [
    AppConfigService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

