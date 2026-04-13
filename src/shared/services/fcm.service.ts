import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private messagingClient: admin.messaging.Messaging | null = null;

  constructor(private readonly configService: AppConfigService) {}

  get isConfigured(): boolean {
    return Boolean(
      this.configService.fcmConfig.projectId &&
        this.configService.fcmConfig.clientEmail &&
        this.configService.fcmConfig.privateKey,
    );
  }

  async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    payload: Record<string, unknown>,
  ) {
    const uniqueTokens = Array.from(new Set(tokens.map((token) => token.trim()).filter(Boolean)));

    if (!uniqueTokens.length) {
      return { sent: 0, skipped: 0, failed: 0, reason: 'No tokens available' };
    }

    if (!this.isConfigured) {
      return {
        sent: 0,
        skipped: uniqueTokens.length,
        failed: 0,
        reason: 'FCM credentials are missing',
      };
    }

    const messaging = this.getMessagingClient();
    if (!messaging) {
      return {
        sent: 0,
        skipped: uniqueTokens.length,
        failed: 0,
        reason: 'FCM client could not be initialized',
      };
    }

    const data = this.normalizeDataPayload(payload);
    let sent = 0;
    let failed = 0;
    const failedTokens: string[] = [];

    const chunks = this.chunkTokens(uniqueTokens, 500);

    for (const chunk of chunks) {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title,
          body,
        },
        data,
      });

      sent += response.successCount;
      failed += response.failureCount;

      response.responses.forEach((result, index) => {
        if (!result.success) {
          failedTokens.push(chunk[index]);
          const code = result.error?.code ?? 'unknown';
          this.logger.warn(`FCM send failed for token index ${index} with code ${code}`);
        }
      });
    }

    this.logger.log(
      `FCM dispatch completed for ${uniqueTokens.length} token(s): sent=${sent}, failed=${failed}`,
    );

    return {
      sent,
      skipped: 0,
      failed,
      failedTokens,
      requested: uniqueTokens.length,
    };
  }

  private getMessagingClient(): admin.messaging.Messaging | null {
    if (this.messagingClient) {
      return this.messagingClient;
    }

    if (!this.isConfigured) {
      return null;
    }

    const { projectId, clientEmail, privateKey } = this.configService.fcmConfig;
    const normalizedPrivateKey = privateKey.replace(/\\n/g, '\n');
    const appName = 'funmap-fcm';

    const existing = admin.apps.find(
      (app): app is admin.app.App => app != null && app.name === appName,
    );
    const app =
      existing ??
      admin.initializeApp(
        {
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: normalizedPrivateKey,
          }),
        },
        appName,
      );

    this.messagingClient = app.messaging();
    return this.messagingClient;
  }

  private normalizeDataPayload(payload: Record<string, unknown>) {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'string') {
        normalized[key] = value;
        continue;
      }

      if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
      ) {
        normalized[key] = String(value);
        continue;
      }

      normalized[key] = JSON.stringify(value);
    }

    return normalized;
  }

  private chunkTokens(tokens: string[], size: number) {
    const chunks: string[][] = [];

    for (let index = 0; index < tokens.length; index += size) {
      chunks.push(tokens.slice(index, index + size));
    }

    return chunks;
  }
}
