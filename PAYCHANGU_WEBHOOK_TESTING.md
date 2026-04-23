# PayChangu Webhook Integration (Sandbox)

This backend now supports a production-ready PayChangu webhook flow at:

- `POST /api/payments/paychangu/webhook`

The webhook implementation includes:

- HMAC SHA-256 webhook signature validation using your webhook secret.
- Server-side re-query to PayChangu verify endpoint before granting value.
- Idempotent processing so duplicate webhooks do not double-process payments.
- Transactional status updates in PostgreSQL.

## Required Environment Variables

Use `.env` (or your secret manager) and never commit real keys.

```env
APP_ENV=development
API_PREFIX=api

PAYCHANGU_BASE_URL=https://api.paychangu.com
PAYCHANGU_SECRET_KEY=sec-test-xxxxxxxxxxxxxxxxxxxxxxxx
PAYCHANGU_WEBHOOK_SECRET=your-paychangu-webhook-secret
PAYCHANGU_WEBHOOK_SIGNATURE_HEADER=signature
PAYCHANGU_VERIFY_PATH=/verify-payment/{tx_ref}
```

## Data Model

`payments` table fields used by this flow:

- `id`
- `userId`
- `reference`
- `amount`
- `currency`
- `status`
- `provider`
- `createdAt`
- `updatedAt`

Additional compatibility fields may also exist (for legacy code), including `providerReference`.

## Webhook Processing Rules

1. Receive webhook payload.
2. Verify signature from the raw request body using webhook secret.
3. Extract `reference`, `tx_ref`, `amount`, `currency`, `status`.
4. Re-query PayChangu: `GET /verify-payment/{tx_ref}` with Bearer secret key.
5. Match verification result with expected payment data.
6. Update payment:
   - `SUCCESS` when verification confirms success.
   - `FAILED` otherwise.
7. Save a transaction record with an idempotency key.
8. Duplicate idempotency keys are ignored safely.

## Local Testing with ngrok

1. Start API:

```bash
cd apps/api
npm install
npm run start:dev
```

2. Expose local API (port 4000):

```bash
ngrok http 4000
```

3. Copy HTTPS forwarding URL from ngrok, then form webhook URL:

```text
https://<your-ngrok-id>.ngrok-free.app/api/payments/paychangu/webhook
```

4. In PayChangu Dashboard:
   - Open **Settings** -> **API & Webhooks**.
   - Set webhook URL to your ngrok URL above.
   - Enable payment events and save.

## PayChangu Dashboard Field Values

Use these exact values while testing in sandbox:

- IP Restrictions:
   - For local ngrok testing, leave IP restriction empty/disabled.
   - If your PayChangu account enforces IP allowlisting, use a stable egress IP only.
   - Note: free ngrok tunnels do not provide a fixed IP.
- Setup Webhook: enabled.
- Webhook URL:
   - `https://<your-ngrok-id>.ngrok-free.app/api/payments/paychangu/webhook`
- Webhook Secret:
   - `funmap-paychangu-sandbox-webhook-secret-2026`
   - This must exactly match `PAYCHANGU_WEBHOOK_SECRET` in your backend environment.
- Receive Webhook Notifications:
   - Enable payment-related notifications (at minimum successful and failed payment updates).

5. Trigger a sandbox payment in your app and confirm webhook delivery.

## Manual Webhook Simulation (Optional)

You can test signature validation before dashboard wiring by sending a signed request.

1. Create payload file `payload.json`.
2. Generate signature:

```bash
export WEBHOOK_SECRET="your-paychangu-webhook-secret"
export PAYLOAD="$(cat payload.json)"
export SIGNATURE="$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')"
```

3. Send webhook:

```bash
curl -X POST "http://localhost:4000/api/payments/paychangu/webhook" \
  -H "Content-Type: application/json" \
  -H "Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

## Security and Production Notes

- Keep all PayChangu secrets in secure secret storage (not source control).
- Use HTTPS-only webhook endpoints in production.
- Keep webhook processing fast and return 200 quickly for valid requests.
- Add background reconciliation for pending payments as backup.
- Disable `DATABASE_SYNCHRONIZE` in production and use migrations.
- Monitor failed verifications and repeated signature failures.
