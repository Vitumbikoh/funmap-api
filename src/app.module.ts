import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CheckinsModule } from './modules/checkins/checkins.module';
import { ChatModule } from './modules/chat/chat.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { EventsModule } from './modules/events/events.module';
import { FeedModule } from './modules/feed/feed.module';
import { FollowsModule } from './modules/follows/follows.module';
import { HealthModule } from './modules/health/health.module';
import { MediaModule } from './modules/media/media.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PostsModule } from './modules/posts/posts.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { ReelsModule } from './modules/reels/reels.module';
import { SearchModule } from './modules/search/search.module';
import { UsersModule } from './modules/users/users.module';
import { AppConfigModule } from './shared/config/app-config.module';
import { AppConfigService } from './shared/config/app-config.service';
import { appConfig } from './shared/config/app.config';
import { databaseConfigFactory } from './shared/database/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    AppConfigModule,
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
    AnalyticsModule,
    UsersModule,
    MediaModule,
    ModerationModule,
    PromotionsModule,
    PostsModule,
    ReelsModule,
    SearchModule,
    EngagementModule,
    EventsModule,
    FollowsModule,
    FeedModule,
    PaymentsModule,
    ChatModule,
    NotificationsModule,
    CheckinsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

