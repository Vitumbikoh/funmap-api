export const appConfig = () => {
  const toBoolean = (value: string | undefined, fallback: boolean) => {
    if (value === undefined) {
      return fallback;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  };

  return {
    app: {
      name: process.env.APP_NAME ?? 'FunMap API',
      env: process.env.APP_ENV ?? 'development',
      host: process.env.APP_HOST ?? '0.0.0.0',
      port: Number(process.env.APP_PORT ?? 4000),
      apiPrefix: process.env.API_PREFIX ?? 'api',
      funOclockDispatchIntervalMinutes: Number(
        process.env.FUN_OCLOCK_DISPATCH_INTERVAL_MINUTES ?? 0,
      ),
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change-me-access',
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh',
      accessTtl: process.env.JWT_ACCESS_TTL ?? '1h',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
    },
    database: {
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      database: process.env.DATABASE_NAME ?? 'funmap',
      username: process.env.DATABASE_USERNAME ?? 'postgres',
      password: process.env.DATABASE_PASSWORD ?? 'postgres',
      synchronize: toBoolean(
        process.env.DATABASE_SYNCHRONIZE,
        (process.env.APP_ENV ?? 'development') !== 'production',
      ),
    },
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
    paychangu: {
      baseUrl: process.env.PAYCHANGU_BASE_URL ?? 'https://api.paychangu.com',
      secretKey: process.env.PAYCHANGU_SECRET_KEY ?? '',
      webhookSecret: process.env.PAYCHANGU_WEBHOOK_SECRET ?? '',
      webhookSignatureHeader:
        process.env.PAYCHANGU_WEBHOOK_SIGNATURE_HEADER ?? 'signature',
      paymentPath: process.env.PAYCHANGU_PAYMENT_PATH ?? '/payment',
      verifyPath: process.env.PAYCHANGU_VERIFY_PATH ?? '/verify-payment/{tx_ref}',
      callbackUrl: process.env.PAYCHANGU_CALLBACK_URL ?? '',
      returnUrl: process.env.PAYCHANGU_RETURN_URL ?? '',
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
      apiKey: process.env.CLOUDINARY_API_KEY ?? '',
      apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    },
    fcm: {
      projectId: process.env.FCM_PROJECT_ID ?? '',
      clientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
      privateKey: process.env.FCM_PRIVATE_KEY ?? '',
    },
    admin: {
      registrationSecret: process.env.ADMIN_REGISTRATION_SECRET ?? '',
    },
  };
};

