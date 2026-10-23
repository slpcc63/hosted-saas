# Square OAuth token encryption

Square OAuth access and refresh tokens are stored as versioned AES-256-GCM envelopes. The
32-byte encryption key is supplied as canonical base64 through
`SQUARE_TOKEN_ENCRYPTION_KEY`; it must never be committed to source control. Generate a key
with a cryptographically secure secret-management tool (for example, `openssl rand -base64
32`) and store it in the deployment environment.

Existing plaintext rows are compatible only after the key is configured. The first normal
application read decrypts the legacy value in memory and conditionally rewrites both tokens as
encrypted envelopes. The conditional update avoids overwriting a concurrent OAuth refresh or
reconnection. New OAuth callbacks and refresh responses are encrypted before every database
write. Missing keys, malformed envelopes, authentication failures, and wrong customer/token
contexts fail closed with messages that contain no token material.

## Reviewed rollout

Do not run this against production merely because local tests pass.

1. Add `SQUARE_TOKEN_ENCRYPTION_KEY` to the intended deployment environment and retain a
   recoverable copy in the approved secret manager.
2. Deploy the exact reviewed commit without changing customer records manually.
3. Exercise one isolated test connection. Confirm reads and refreshes succeed.
4. Verify migration by counts and envelope prefixes only. Never select or print complete token
   columns:

   ```sql
   select
     count(*) filter (where access_token like 'sqtoken:v1:%') as encrypted_access_tokens,
     count(*) filter (where refresh_token like 'sqtoken:v1:%') as encrypted_refresh_tokens,
     count(*) as total_connections
   from public.square_connections;
   ```

5. Keep the encryption key available during rollback. Code that predates encrypted-envelope
   support cannot read rewritten rows, so an application rollback must use a release that retains
   the encryption reader.

Key rotation is not automatic in this release. A future envelope version and reviewed migration
must be introduced before replacing the configured key.
