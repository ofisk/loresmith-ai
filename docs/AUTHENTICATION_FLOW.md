# Authentication Flow Documentation

## Overview

Loresmith AI uses JWT (JSON Web Token) based authentication with client-side token storage and server-side validation. This document describes the complete authentication flow, state management, error handling, and security practices.

## Authentication State Machine

The authentication system operates through the following states:

```
┌─────────────────┐
│ Unauthenticated │
└────────┬────────┘
         │
         │ User submits credentials
         ▼
┌─────────────────┐
│ Authenticating  │
└────────┬────────┘
         │
         │ Success
         ▼
┌─────────────────┐
│  Authenticated  │
└────────┬────────┘
         │
         │ Token expires or invalid
         ▼
┌─────────────────┐
│    Expired      │
└─────────────────┘
```

### State Descriptions

1. **Unauthenticated**: No valid JWT token exists in localStorage. User must provide credentials.
2. **Authenticating**: User has submitted credentials and request is in progress.
3. **Authenticated**: Valid JWT token exists and is not expired. User can access protected resources.
4. **Expired**: JWT token exists but has expired. User must re-authenticate.

### State Transitions

- **Unauthenticated → Authenticating**: User submits authentication form
- **Authenticating → Authenticated**: Server returns valid JWT token
- **Authenticating → Unauthenticated**: Authentication fails (invalid credentials, server error)
- **Authenticated → Expired**: Token expiration time is reached
- **Expired → Authenticated**: User re-authenticates successfully
- **Any state → Unauthenticated**: User explicitly logs out or token is cleared

## Token Lifecycle

### Token Creation

JWT tokens are created by the `AuthService.authenticateUser()` method when a user successfully authenticates:

1. User submits credentials via `POST /auth/authenticate`:
   - `username` (required)
   - `openaiApiKey` (required)
   - `adminSecret` (optional)

2. Server validates credentials:
   - Username must be non-empty
   - Admin secret is validated if provided (checks against `ADMIN_SECRET` environment variable)
   - OpenAI API key is stored in database for the user

3. JWT token is created with:
   - **Algorithm**: HS256
   - **Expiration**: 24 hours from issuance
   - **Payload**:
     - `type`: "user-auth"
     - `username`: User's username
     - `openaiApiKey`: User's OpenAI API key (optional, may be in token)
     - `isAdmin`: Boolean indicating admin status
     - `iat`: Issued at timestamp
     - `exp`: Expiration timestamp

4. Token is signed using `ADMIN_SECRET` (or fallback secret if not configured)

### Token Storage

- **Location**: Browser `localStorage` with key `JWT_STORAGE_KEY` (value: "loresmith-jwt")
- **Storage Method**: `AuthService.storeJwt(token)` stores the token and dispatches a `jwt-changed` event
- **Retrieval**: `AuthService.getStoredJwt()` retrieves the token from localStorage

### Token Validation

#### Client-Side Validation

Multiple hooks and utilities check token validity:

1. **`useAuthReady`**: Continuously monitors JWT status
   - Checks for token existence
   - Validates expiration using `isJwtExpired()`
   - Polls every 1 second when auth is not ready
   - Listens for `storage` and `jwt-changed` events

2. **`useJwtExpiration`**: Monitors token expiration
   - Checks expiration on mount
   - Listens for `jwt-expired` custom events
   - Provides expiration state and message

3. **`useAppAuthentication`**: Manages app-level authentication state
   - Checks JWT payload for username
   - Validates token expiration
   - Manages authentication modal visibility

4. **`isJwtExpired(jwt: string)`**: Static utility function
   - Parses JWT payload (Base64URL decoding)
   - Compares `exp` claim with current time
   - Returns `true` if expired or invalid

#### Server-Side Validation

Server validates tokens on protected endpoints:

1. **Middleware**: `requireUserJwt()` in `src/middleware/auth.ts`
   - Extracts `Authorization: Bearer <token>` header
   - Verifies token signature using JWT secret
   - Validates token type is "user-auth"
   - Attaches user auth payload to request context

2. **Route Handlers**: `requireUserJwt` in `src/routes/auth.ts`
   - Similar validation for route-specific protection
   - Returns 401 if token is missing, invalid, or expired

### Token Expiration

- **Expiration Time**: 24 hours from issuance
- **Expiration Detection**:
  - Client-side: `isJwtExpired()` checks `exp` claim
  - Server-side: `jwtVerify()` automatically rejects expired tokens
- **Expiration Handling**:
  - Client detects expiration and shows authentication modal
  - Server returns 401 Unauthorized for expired tokens
  - `jwt-expired` event is dispatched when server detects expiration
  - Token is automatically cleared from localStorage

### Token Invalidation

Tokens are invalidated in the following scenarios:

1. **Explicit Logout**: User clicks logout, token is cleared from localStorage
2. **Expiration**: Token expires, automatically cleared
3. **Invalid Token**: Token fails signature verification, cleared on detection
4. **Storage Event**: Token removed from localStorage in another tab/window

## Token Expiration Handling

### Client-Side Expiration Detection

The system uses multiple mechanisms to detect token expiration:

#### 1. `useAuthReady` Hook

Located in `src/hooks/useAuthReady.ts`:

- **Purpose**: Determines when authentication is ready for use
- **Mechanism**:
  - Polls every 1 second when auth is not ready
  - Checks token existence and expiration
  - Stops polling once auth becomes ready
  - Listens for storage changes and `jwt-changed` events
- **Returns**: `boolean` indicating if auth is ready

#### 2. `useJwtExpiration` Hook

Located in `src/hooks/useJwtExpiration.ts`:

- **Purpose**: Monitors and handles token expiration
- **Mechanism**:
  - Checks expiration on mount (if `checkOnMount` is true)
  - Listens for `jwt-expired` custom events
  - Provides expiration state and user-facing message
- **Returns**: `{ isExpired, expirationMessage, clearExpiration }`

#### 3. `useAppAuthentication` Hook

Located in `src/hooks/useAppAuthentication.ts`:

- **Purpose**: Manages app-level authentication state
- **Mechanism**:
  - Checks JWT payload for username
  - Validates token expiration using `AuthService.isJwtExpired()`
  - Shows authentication modal when expired
  - Manages stored OpenAI key state

### Server-Side Expiration Detection

Server automatically rejects expired tokens:

1. **JWT Verification**: `jwtVerify()` from `jose` library automatically checks `exp` claim
2. **Error Response**: Returns 401 Unauthorized with error message
3. **Event Dispatch**: Client-side `authenticatedFetchWithExpiration()` dispatches `jwt-expired` event

### Expiration Event System

The system uses custom events for expiration communication:

1. **`jwt-changed`**: Dispatched when JWT is stored or removed
   - Dispatched by: `AuthService.storeJwt()` and `AuthService.clearJwt()`
   - Listened by: `useAuthReady`, `useAppAuthentication`

2. **`jwt-expired`**: Dispatched when server detects expired token
   - Dispatched by: `AuthService.authenticatedFetchWithExpiration()`
   - Payload: `{ message: "Your session has expired. Please sign in again." }`
   - Listened by: `useJwtExpiration`

### User Experience During Expiration

When a token expires:

1. **Automatic Detection**: Client or server detects expiration
2. **Token Cleanup**: Expired token is removed from localStorage
3. **Modal Display**: `BlockingAuthenticationModal` is shown
4. **User Action**: User must re-authenticate with credentials
5. **New Token**: New JWT token is issued upon successful authentication

## Current Limitations

### No Refresh Token Mechanism

- **Current Behavior**: Users must manually re-authenticate when tokens expire
- **Impact**: Users experience interruption after 24 hours of inactivity
- **Future Consideration**: Implement refresh token flow for seamless token renewal

### Manual Re-Authentication Required

- **Current Behavior**: Expired tokens require full credential re-entry
- **Impact**: Users must remember and re-enter OpenAI API key
- **Mitigation**: OpenAI API key is stored in database, but user must still provide username and admin key

### Concurrent Session Management

- **Current Behavior**:
  - Each browser tab/window maintains its own localStorage
  - Multiple tabs can have different authentication states
  - Storage events synchronize token changes across tabs
- **Limitations**:
  - No server-side session tracking
  - No explicit session invalidation mechanism
  - Concurrent logins from different devices are not prevented
- **Future Consideration**: Implement server-side session management with session IDs

## Error Handling

### Error Scenarios

#### 1. Missing Token

**Scenario**: User attempts to access protected resource without token

**Client-Side**:

- `useAuthReady` returns `false`
- Authentication modal is displayed
- User must authenticate

**Server-Side**:

- `requireUserJwt` middleware returns 401
- Error message: "Authorization header required" or "Missing or invalid Authorization header"

**User-Facing Message**: "Authentication required. Please log in."

#### 2. Expired Token

**Scenario**: Token exists but has passed expiration time

**Client-Side**:

- `isJwtExpired()` returns `true`
- Token is cleared from localStorage
- `jwt-expired` event is dispatched
- Authentication modal is displayed

**Server-Side**:

- `jwtVerify()` throws `JWTExpired` error
- Returns 401 Unauthorized
- Error message: "Invalid or expired token"

**User-Facing Message**: "Your session has expired. Please re-authenticate."

#### 3. Invalid Token

**Scenario**: Token is malformed, has invalid signature, or wrong type

**Client-Side**:

- Token parsing fails
- Token is treated as expired/invalid
- Authentication modal is displayed

**Server-Side**:

- `jwtVerify()` throws verification error
- Returns 401 Unauthorized
- Error message: "Invalid token" or "Invalid token type"

**User-Facing Message**: "Authentication required. Please log in."

#### 4. Network Errors During Authentication

**Scenario**: Network failure when submitting authentication request

**Client-Side**:

- Fetch request fails
- Error is caught in `handleAuthenticationSubmit`
- Error message is displayed in authentication modal

**User-Facing Message**: Error from server or "Network error occurred. Please check your connection."

#### 5. Server Errors

**Scenario**: Server encounters internal error during authentication

**Server-Side**:

- Returns 500 Internal Server Error
- Error message: "Internal server error" or "Failed to create authentication token"

**Client-Side**:

- Error is displayed in authentication modal
- User can retry authentication

**User-Facing Message**: "Internal server error" or specific error from server

#### 6. Invalid Credentials

**Scenario**: User provides incorrect username, admin key, or OpenAI API key

**Server-Side**:

- Admin secret validation fails (if provided)
- Returns 401 Unauthorized
- Error message: Specific error from `AuthService.authenticateUser()`

**Client-Side**:

- Error is displayed in authentication modal
- User can correct credentials and retry

**User-Facing Message**: Error message from server (e.g., "Invalid admin secret")

### Error Message Constants

Error messages are defined in `src/app-constants.ts`:

- `ERROR_MESSAGES.AUTHENTICATION_REQUIRED`: "Authentication required. Please log in."
- `ERROR_MESSAGES.AUTHENTICATION_FAILED`: "Authentication failed. Please check your credentials."
- `ERROR_MESSAGES.ACCESS_DENIED`: "Access denied. You don't have permission to perform this action."
- `USER_MESSAGES.SESSION_EXPIRED`: "Your session has expired. Please re-authenticate."

### Error Handling Flow

```
Request → Check Token → Validate Token → Process Request
           │                │
           │                └─ Invalid/Expired → 401 Error
           │
           └─ Missing → 401 Error
```

## Security Best Practices

### Current Security Measures

#### 1. JWT Signing

- **Algorithm**: HS256 (HMAC with SHA-256)
- **Secret**: Uses `ADMIN_SECRET` environment variable
- **Fallback**: Uses fallback secret if `ADMIN_SECRET` not configured (for non-admin users)
- **Verification**: All tokens are verified server-side before processing requests

#### 2. Token Storage

- **Location**: Browser `localStorage`
- **Pros**:
  - Persists across browser sessions
  - Accessible to JavaScript for client-side validation
  - Simple implementation
- **Cons**:
  - Vulnerable to XSS attacks
  - Accessible to any script running on the domain
  - Not automatically sent with requests (must be manually added to headers)

#### 3. Server-Side Validation

- **Middleware**: All protected routes use `requireUserJwt` middleware
- **Verification**: Token signature is verified on every request
- **Type Checking**: Token type must be "user-auth"
- **Expiration**: Automatically checked by `jwtVerify()`

#### 4. Admin Secret Handling

- **Storage**: `ADMIN_SECRET` stored as environment variable (Cloudflare Workers secrets)
- **Validation**: Admin secret is validated server-side only
- **Token Inclusion**: Admin status (`isAdmin`) is included in JWT payload
- **No Client Exposure**: Admin secret is never exposed to client

#### 5. OpenAI API Key Storage

- **Database Storage**: OpenAI API keys are stored in D1 database (`user_openai_keys` table)
- **Token Inclusion**: API key may be included in JWT payload (optional)
- **Access Control**: Keys are user-specific and not shared

### Security Considerations

#### 1. XSS Vulnerability

- **Risk**: localStorage is accessible to any JavaScript on the domain
- **Mitigation**:
  - Use Content Security Policy (CSP) headers
  - Sanitize all user inputs
  - Avoid `eval()` and `innerHTML` with user content
- **Recommendation**: Consider using httpOnly cookies for token storage (requires server-side rendering or cookie-based auth)

#### 2. Token Lifetime

- **Current**: 24 hours
- **Consideration**: Balance between security and user experience
- **Recommendation**: Consider shorter lifetimes (e.g., 1 hour) with refresh tokens

#### 3. No Token Revocation

- **Current**: Tokens cannot be revoked until expiration
- **Risk**: Compromised tokens remain valid until expiration
- **Recommendation**: Implement token blacklist or session management for revocation

#### 4. Concurrent Sessions

- **Current**: No server-side session tracking
- **Risk**: Multiple devices can use the same token
- **Recommendation**: Implement session management with device tracking

#### 5. Secret Management

- **Current**: Uses environment variables (Cloudflare Workers secrets)
- **Good Practice**: Secrets are not exposed to client
- **Recommendation**: Rotate secrets periodically

## API Endpoints

### Authentication Endpoints

All authentication endpoints are defined in `src/routes/auth.ts` and mounted at `/auth/*`.

#### 1. `POST /auth/authenticate`

**Purpose**: Authenticate user and receive JWT token

**Authentication**: None required

**Request Body**:

```json
{
  "username": "string (required)",
  "openaiApiKey": "string (required)",
  "adminSecret": "string (optional)"
}
```

**Request Headers**:

- `X-Session-ID`: Optional session identifier (defaults to "default")
- `Content-Type`: application/json

**Response (Success - 200)**:

```json
{
  "token": "string (JWT token)"
}
```

**Response (Error - 401)**:

```json
{
  "error": "string (error message)"
}
```

**Response (Error - 500)**:

```json
{
  "error": "Internal server error"
}
```

**Error Cases**:

- Missing username: Returns 401 with "Username is required"
- Invalid admin secret: Returns 401 with error message
- JWT creation failure: Returns 500 with "Internal server error"

**Implementation**: `handleAuthenticate()` in `src/routes/auth.ts`

---

#### 2. `GET /auth/get-openai-key`

**Purpose**: Retrieve stored OpenAI API key for a user

**Authentication**: None required (but key is user-specific)

**Query Parameters**:

- `username`: string (required)

**Response (Success - 200)**:

```json
{
  "hasKey": true,
  "apiKey": "string (if hasKey is true)"
}
```

or

```json
{
  "hasKey": false
}
```

**Response Headers**:

- `Cache-Control`: private, max-age=300 (5 minutes)

**Response (Error - 400)**:

```json
{
  "error": "Username is required"
}
```

**Response (Error - 500)**:

```json
{
  "error": "Internal server error"
}
```

**Implementation**: `handleGetOpenAIKey()` in `src/routes/auth.ts`

---

#### 3. `POST /auth/store-openai-key`

**Purpose**: Store OpenAI API key for a user in database

**Authentication**: None required (but should be protected in production)

**Request Body**:

```json
{
  "username": "string (required)",
  "apiKey": "string (required)"
}
```

**Response (Success - 200)**:

```json
{
  "success": true,
  "message": "OpenAI API key stored successfully"
}
```

**Response (Error - 400)**:

```json
{
  "error": "Username and API key are required"
}
```

**Response (Error - 500)**:

```json
{
  "error": "Internal server error"
}
```

**Implementation**: `handleStoreOpenAIKey()` in `src/routes/auth.ts`

---

#### 4. `DELETE /auth/delete-openai-key`

**Purpose**: Delete stored OpenAI API key for a user

**Authentication**: None required (but should be protected in production)

**Request Body**:

```json
{
  "username": "string (required)"
}
```

**Response (Success - 200)**:

```json
{
  "success": true,
  "message": "OpenAI API key deleted successfully"
}
```

**Response (Error - 400)**:

```json
{
  "error": "Username is required"
}
```

**Response (Error - 500)**:

```json
{
  "error": "Internal server error"
}
```

**Implementation**: `handleDeleteOpenAIKey()` in `src/routes/auth.ts`

---

#### 5. `GET /auth/check-open-ai-key`

**Purpose**: Check if OpenAI API key exists for a user (or if default key is configured)

**Authentication**: None required

**Query Parameters**:

- `username`: string (optional)

**Response (Success - 200)**:

```json
{
  "success": true,
  "hasKey": true,
  "requiresUserKey": false
}
```

or

```json
{
  "success": true,
  "hasKey": false,
  "requiresUserKey": true
}
```

or (if no username provided)

```json
{
  "success": false,
  "hasKey": false,
  "requiresUserKey": true
}
```

**Response (Error - 500)**:

```json
{
  "success": false,
  "error": "Failed to check OpenAI key"
}
```

**Implementation**: `handleCheckOpenAIKey()` in `src/routes/auth.ts`

---

#### 6. `POST /auth/set-openai-key`

**Purpose**: Set OpenAI API key in Chat durable object session

**Authentication**: JWT token required (via Authorization header)

**Request Body**:

```json
{
  "openaiApiKey": "string (required)"
}
```

**Request Headers**:

- `Authorization`: Bearer <JWT token>
- `X-Session-ID`: Optional session identifier (defaults to "default")
- `Content-Type`: application/json

**Response (Success - 200)**:

```json
{
  "success": true,
  "message": "OpenAI API key set successfully"
}
```

**Response (Error - 400)**:

```json
{
  "error": "OpenAI API key is required"
}
```

or

```json
{
  "error": "Invalid OpenAI API key"
}
```

**Response (Error - 500)**:

```json
{
  "error": "Internal server error"
}
```

or

```json
{
  "error": "Failed to set OpenAI API key: <error details>"
}
```

**Implementation**: `handleSetOpenAIApiKey()` in `src/routes/auth.ts`

**Note**: This endpoint validates the OpenAI API key by making a test request to OpenAI's API before storing it.

---

#### 7. `GET /auth/check-user-openai-key`

**Purpose**: Check if user has stored OpenAI API key in database

**Authentication**: None required

**Query Parameters**:

- `username`: string (required)

**Response (Success - 200)**:

```json
{
  "success": true,
  "hasUserStoredKey": true
}
```

or

```json
{
  "success": true,
  "hasUserStoredKey": false
}
```

**Response (Error - 400)**:

```json
{
  "error": "Username is required"
}
```

**Response (Error - 500)**:

```json
{
  "success": false,
  "hasUserStoredKey": false
}
```

**Implementation**: `handleCheckUserOpenAIKey()` in `src/routes/auth.ts`

---

#### 8. `POST /auth/logout`

**Purpose**: Logout user (client-side token cleanup)

**Authentication**: None required

**Request Body**: None

**Response (Success - 200)**:

```json
{
  "success": true,
  "message": "Logout successful. Please clear your browser's local storage."
}
```

**Response (Error - 500)**:

```json
{
  "error": "Internal server error"
}
```

**Implementation**: `handleLogout()` in `src/routes/auth.ts`

**Note**: This endpoint only returns success. The client is responsible for clearing the JWT token from localStorage. The `handleLogout` function in hooks/components should call `AuthService.clearJwt()`.

---

### Protected Endpoints

Most endpoints require JWT authentication via the `Authorization: Bearer <token>` header. The `requireUserJwt` middleware validates the token before processing the request.

**Common Authentication Header**:

```
Authorization: Bearer <JWT token>
```

**Common Error Responses**:

- **401 Unauthorized**: Missing, invalid, or expired token
- **403 Forbidden**: Valid token but insufficient permissions (if implemented)

## Client-Side Integration

### Hooks

#### `useAuthReady()`

Returns `boolean` indicating if authentication is ready. Used to gate UI rendering until auth state is determined.

```typescript
const authReady = useAuthReady();
if (!authReady) {
  return <Loading />;
}
```

#### `useJwtExpiration()`

Monitors token expiration and provides expiration state.

```typescript
const { isExpired, expirationMessage, clearExpiration } = useJwtExpiration({
  onExpiration: () => {
    // Handle expiration
  },
});
```

#### `useAppAuthentication()`

Manages app-level authentication state including username, stored OpenAI key, and authentication modal visibility.

```typescript
const {
  username,
  storedOpenAIKey,
  isAuthenticated,
  showAuthModal,
  handleAuthenticationSubmit,
  handleLogout,
} = useAppAuthentication();
```

### Components

#### `BlockingAuthenticationModal`

Modal component that blocks UI until user authenticates. Cannot be closed until authentication is successful.

**Props**:

- `isOpen`: boolean
- `storedOpenAIKey`: string (optional)
- `onSubmit`: (username, adminKey, openaiApiKey) => Promise<void>
- `onClose`: () => void (optional, but modal cannot be closed)

### Utilities

#### `AuthService.getStoredJwt()`

Retrieves JWT token from localStorage.

#### `AuthService.isJwtExpired(jwt: string)`

Checks if JWT token is expired.

#### `AuthService.storeJwt(token: string)`

Stores JWT token in localStorage and dispatches `jwt-changed` event.

#### `AuthService.clearJwt()`

Removes JWT token from localStorage and dispatches `jwt-changed` event.

#### `AuthService.createAuthHeaders(jwt?: string | null)`

Creates headers object with Authorization header for API requests.

#### `AuthService.authenticatedFetchWithExpiration(url, options)`

Makes authenticated fetch request and handles token expiration automatically.

## Testing Checklist

Based on GitHub issue #206, the following areas should be tested:

- [x] Test token expiration handling
- [ ] Test refresh token flow (not implemented)
- [ ] Test concurrent session management
- [x] Verify error handling for all failure modes
- [x] Review security best practices
- [x] Document authentication state machine
- [x] Update API documentation

## Future Improvements

1. **Refresh Token Mechanism**: Implement refresh tokens for seamless token renewal
2. **Session Management**: Add server-side session tracking with session IDs
3. **Token Revocation**: Implement token blacklist for immediate revocation
4. **Device Tracking**: Track and manage sessions per device
5. **Shorter Token Lifetime**: Reduce token lifetime and use refresh tokens
6. **HttpOnly Cookies**: Consider using httpOnly cookies instead of localStorage for better XSS protection

## References

- `src/services/core/auth-service.ts` - Core authentication logic
- `src/routes/auth.ts` - Authentication API endpoints
- `src/middleware/auth.ts` - Authentication middleware
- `src/hooks/useAuthReady.ts` - Auth readiness checking
- `src/hooks/useJwtExpiration.ts` - Expiration handling
- `src/hooks/useAppAuthentication.ts` - App-level auth state
- `src/components/auth/AuthProvider.tsx` - Auth context provider
- `src/components/BlockingAuthenticationModal.tsx` - Authentication UI
- `src/app-constants.ts` - Error messages and constants
