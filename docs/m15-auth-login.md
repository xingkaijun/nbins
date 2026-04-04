# M15 — Minimal Backend Auth Login Increment

> Updated: 2026-04-04 15:58 Asia/Shanghai
> Status: implemented in API package, validated at API scope

## What this increment adds

This milestone introduces the **first real backend auth capability** into NBINS.
It is intentionally small and backend-only:

- `POST /api/auth/login`
- PBKDF2-SHA256 password hashing + verification utilities
- narrow D1 user lookup by username
- auth helper scaffolding for future protected routes

This is **not** the final auth system yet.
It does **not** issue JWTs, set cookies, or protect existing inspection routes.

## Scope

Included in M15:

- login request validation
- username/password authentication against mock + D1-backed storage
- password hash utility implementation
- D1 `users` lookup by `username`
- bearer-token helper scaffolding (`extractBearerToken`, `createRequireAuth`, `createRequireRole`)
- focused route/middleware tests

Explicitly not included yet:

- JWT issuance
- refresh token lifecycle
- logout / session invalidation
- route protection wiring for production endpoints
- frontend auth state management

## Route

### `POST /api/auth/login`

Request body:

```json
{
  "username": "li.si",
  "password": "<password>"
}
```

Success response:

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "user-inspector-li",
      "username": "li.si",
      "displayName": "Li Si",
      "role": "inspector",
      "disciplines": ["PAINT", "MACHINERY"]
    }
  }
}
```

Failure behavior:

- malformed JSON → `400`
- non-object body → `400`
- missing `username` / `password` → `400`
- invalid credentials → `401`

## Implementation layout

Core files:

- `packages/api/src/routes/auth.ts`
- `packages/api/src/services/auth-service.ts`
- `packages/api/src/repositories/user-repository.ts`
- `packages/api/src/auth/password.ts`
- `packages/api/src/auth.ts`

Persistence-related changes:

- `packages/api/src/persistence/inspection-storage.ts`
- `packages/api/src/persistence/d1-inspection-storage.ts`
- `packages/api/src/persistence/d1-seeded-inspection-storage.ts`
- `packages/api/src/persistence/mock-inspection-db.ts`
- `packages/api/src/persistence/seed.ts`
- `packages/api/src/db/schema.ts`

Contract/data alignment:

- `packages/shared/src/index.ts`
- `packages/api/src/domain/inspection-item-submission.ts`

## Password hashing

The implementation uses **PBKDF2-SHA256** with a Django-style serialized format:

```text
pbkdf2_sha256$<iterations>$<saltHex>$<derivedKeyHex>
```

Current utility functions:

- `createPasswordHash(password, options?)`
- `verifyPasswordHash(password, storedHash)`

Notes:

- mock + seeded users now use real verifiable hashes instead of `dev-only`
- invalid or malformed stored hashes safely fail closed
- comparison uses a timing-safe byte comparison routine

## Storage behavior

### Mock path

Mock users are resolved from in-memory storage by normalized username.
This keeps local demo auth behavior consistent with the API route.

### D1 path

D1 auth lookup is intentionally narrow:

```sql
SELECT * FROM "users" WHERE "username" = ?
```

This avoids falling back to a full snapshot read just to authenticate one user.

## Auth scaffolding added for future work

`packages/api/src/auth.ts` now provides:

- `extractBearerToken()`
- `createRequireAuth()`
- `createRequireRole()`

These helpers are **not yet wired into product routes**, but they establish the request-context and authorization shape for the next milestone.

## Validation completed

Validated at API scope with:

```bash
pnpm --filter @nbins/api test
pnpm --filter @nbins/api typecheck
pnpm --filter @nbins/api build
```

Result at time of writing:

- API tests: pass
- API typecheck: pass
- API build: pass

## Known gaps

Still missing before auth can be considered production-ready:

1. JWT access token issuance
2. refresh token strategy
3. protected-route wiring
4. session invalidation / logout
5. frontend login flow integration
6. password reset / change-password flow

## Recommended next step

Proceed with a small **M16** auth increment:

- issue signed access tokens from `/api/auth/login`
- define token verification contract used by `createRequireAuth`
- protect one or two low-risk routes first to validate the flow end to end
