/**
 * auth.service.test.ts — Auth service unit tests.
 *
 * All Supabase clients are mocked. Tests verify:
 *   - Service logic (error mapping, profile verification, audit calls)
 *   - Failure modes (trigger failure cleanup, deactivated account)
 *   - Data flow (tokens extracted correctly, profiles loaded)
 *
 * Run: npm run test -- --filter auth.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoist mocks to ensure they are available to vi.mock ────────────────────
const {
  mockSignUp,
  mockSignInWithPassword,
  mockRefreshSession,
  mockAdminSignOut,
  mockAdminDeleteUser,
  mockAdminUpdateUser,
  mockFrom,
  mockAuditLog,
  mockAuditLogLogin,
  mockAuditLogLogout,
  mockAuditRegistration,
} = vi.hoisted(() => ({
  mockSignUp:             vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockRefreshSession:     vi.fn(),
  mockAdminSignOut:       vi.fn(),
  mockAdminDeleteUser:    vi.fn(),
  mockAdminUpdateUser:    vi.fn(),
  mockFrom:               vi.fn(),
  mockAuditLog:           vi.fn().mockResolvedValue(undefined),
  mockAuditLogLogin:      vi.fn().mockResolvedValue(undefined),
  mockAuditLogLogout:     vi.fn().mockResolvedValue(undefined),
  mockAuditRegistration:  vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/config/supabase.js', () => ({
  supabaseAnon: () => ({
    auth: {
      signUp:             mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      refreshSession:     mockRefreshSession,
    },
  }),
  supabaseServiceRole: () => ({
    auth: {
      admin: {
        signOut:        mockAdminSignOut,
        deleteUser:     mockAdminDeleteUser,
        updateUserById: mockAdminUpdateUser,
      },
    },
    from: mockFrom,
  }),
}));

vi.mock('../../src/services/audit.service.js', () => ({
  auditService: {
    log:             mockAuditLog,
    logLogin:        mockAuditLogLogin,
    logLogout:       mockAuditLogLogout,
    logRegistration: mockAuditRegistration,
    logStatusChange: vi.fn(),
  },
}));

import { authService } from '../../src/services/auth.service.js';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  InternalError,
  ExternalServiceError,
} from '../../src/errors/app-error.js';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const MOCK_USER_ID   = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_EMAIL     = 'test@example.com';
const MOCK_FULL_NAME = 'Test User';
const MOCK_PHONE     = '+265991234567';

const MOCK_AUTH_USER = {
  id:    MOCK_USER_ID,
  email: MOCK_EMAIL,
};

const MOCK_SESSION = {
  access_token:  'access_token_value',
  refresh_token: 'refresh_token_value',
  expires_in:    3600,
  token_type:    'bearer',
};

const MOCK_PROFILE = {
  id:           MOCK_USER_ID,
  email:        MOCK_EMAIL,
  full_name:    MOCK_FULL_NAME,
  phone_number: MOCK_PHONE,
  role:         'customer' as const,
  is_active:    true,
  fcm_token:    null,
  created_at:   '2024-01-01T00:00:00Z',
  updated_at:   '2024-01-01T00:00:00Z',
};

const MOCK_REGISTER_INPUT = {
  email:        MOCK_EMAIL,
  password:     'SecurePass1!',
  full_name:    MOCK_FULL_NAME,
  phone_number: MOCK_PHONE,
};

const MOCK_LOGIN_INPUT = {
  email:    MOCK_EMAIL,
  password: 'SecurePass1!',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupSuccessfulProfileFetch() {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: MOCK_PROFILE, error: null }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });
}

function setupFailedProfileFetch() {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data:  null,
      error: { message: 'no rows found', code: 'PGRST116' },
    }),
    update: vi.fn().mockReturnThis(),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthService.register()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers successfully and returns user + tokens', async () => {
    mockSignUp.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    setupSuccessfulProfileFetch();

    const result = await authService.register(MOCK_REGISTER_INPUT, '1.2.3.4', 'TestAgent/1.0');

    expect(result.user.id).toBe(MOCK_USER_ID);
    expect(result.user.email).toBe(MOCK_EMAIL);
    expect(result.user.role).toBe('customer');
    expect(result.tokens.access_token).toBe('access_token_value');
    expect(result.tokens.refresh_token).toBe('refresh_token_value');
    expect(result.tokens.expires_in).toBe(3600);
    expect(result.tokens.token_type).toBe('bearer');
  });

  it('calls audit service after successful registration', async () => {
    mockSignUp.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    setupSuccessfulProfileFetch();

    await authService.register(MOCK_REGISTER_INPUT, '1.2.3.4', 'TestAgent/1.0');

    expect(mockAuditRegistration).toHaveBeenCalledWith(
      MOCK_USER_ID,
      '1.2.3.4',
      'TestAgent/1.0',
    );
  });

  it('throws ConflictError when email is already registered', async () => {
    mockSignUp.mockResolvedValue({
      data:  { user: null, session: null },
      error: { message: 'User already registered' },
    });

    await expect(
      authService.register(MOCK_REGISTER_INPUT, '1.2.3.4', 'TestAgent/1.0'),
    ).rejects.toThrow(ConflictError);
  });

  it('throws ConflictError with user-friendly message (no Supabase internals)', async () => {
    mockSignUp.mockResolvedValue({
      data:  { user: null, session: null },
      error: { message: 'User already registered' },
    });

    await expect(
      authService.register(MOCK_REGISTER_INPUT, '1.2.3.4', 'TestAgent/1.0'),
    ).rejects.toThrow('already exists');
  });

  it('throws InternalError and cleans up orphaned auth user when profile trigger fails', async () => {
    mockSignUp.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    // All 3 profile fetch attempts fail
    setupFailedProfileFetch();
    mockAdminDeleteUser.mockResolvedValue({ error: null });

    await expect(
      authService.register(MOCK_REGISTER_INPUT, '1.2.3.4', 'TestAgent/1.0'),
    ).rejects.toThrow(InternalError);

    // Verify cleanup was attempted
    expect(mockAdminDeleteUser).toHaveBeenCalledWith(MOCK_USER_ID);
  });

  it('still throws InternalError even if cleanup of orphaned user fails', async () => {
    mockSignUp.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    setupFailedProfileFetch();
    mockAdminDeleteUser.mockResolvedValue({
      error: { message: 'Delete failed' },
    });

    // Should still throw InternalError (not the delete error)
    await expect(
      authService.register(MOCK_REGISTER_INPUT, '1.2.3.4', 'TestAgent/1.0'),
    ).rejects.toThrow(InternalError);
  });

  it('throws InternalError when signUp returns no session (email confirmation misconfigured)', async () => {
    mockSignUp.mockResolvedValue({
      // Supabase returns user but no session when email confirmation is required
      data:  { user: MOCK_AUTH_USER, session: null },
      error: null,
    });

    await expect(
      authService.register(MOCK_REGISTER_INPUT, '1.2.3.4', 'TestAgent/1.0'),
    ).rejects.toThrow(InternalError);
  });

  it('throws ExternalServiceError on unknown Supabase error', async () => {
    mockSignUp.mockResolvedValue({
      data:  { user: null, session: null },
      error: { message: 'unexpected internal error from supabase' },
    });

    await expect(
      authService.register(MOCK_REGISTER_INPUT, '1.2.3.4', 'TestAgent/1.0'),
    ).rejects.toThrow(ExternalServiceError);
  });
});

describe('AuthService.login()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs in successfully and returns user + tokens', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    setupSuccessfulProfileFetch();

    const result = await authService.login(MOCK_LOGIN_INPUT, '1.2.3.4', 'TestAgent/1.0');

    expect(result.user.id).toBe(MOCK_USER_ID);
    expect(result.tokens.access_token).toBe('access_token_value');
  });

  it('calls audit service on successful login', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    setupSuccessfulProfileFetch();

    await authService.login(MOCK_LOGIN_INPUT, '1.2.3.4', 'TestAgent/1.0');

    expect(mockAuditLogLogin).toHaveBeenCalledWith(MOCK_USER_ID, '1.2.3.4', 'TestAgent/1.0');
  });

  it('throws AuthenticationError on invalid credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    await expect(
      authService.login(MOCK_LOGIN_INPUT, '1.2.3.4', 'TestAgent/1.0'),
    ).rejects.toThrow(AuthenticationError);
  });

  it('error message does not reveal whether email exists (account enumeration prevention)', async () => {
    // Wrong password
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    const wrongPasswordError = await authService
      .login(MOCK_LOGIN_INPUT, '1.2.3.4', 'UA')
      .catch((e: AuthenticationError) => e);

    // Non-existent email
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: null, session: null },
      error: { message: 'User not found' },
    });

    const notFoundError = await authService
      .login({ email: 'nope@nope.com', password: 'pass' }, '1.2.3.4', 'UA')
      .catch((e: AuthenticationError) => e);

    // Both errors should have the same message
    expect((wrongPasswordError as AuthenticationError).message).toBe(
      (notFoundError as AuthenticationError).message,
    );
  });

  it('throws AuthorizationError for deactivated accounts', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    // Profile is_active = false
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data:  { ...MOCK_PROFILE, is_active: false },
        error: null,
      }),
    });

    await expect(
      authService.login(MOCK_LOGIN_INPUT, '1.2.3.4', 'TestAgent/1.0'),
    ).rejects.toThrow(AuthorizationError);
  });

  it('writes failed login audit entry for deactivated account', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data:  { ...MOCK_PROFILE, is_active: false },
        error: null,
      }),
    });

    await authService.login(MOCK_LOGIN_INPUT, '1.2.3.4', 'UA').catch(() => {});

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: 'account_deactivated' }),
    );
  });

  it('writes failed login audit entry when credentials are wrong', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    await authService.login(MOCK_LOGIN_INPUT, '1.2.3.4', 'UA').catch(() => {});

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });
});

describe('AuthService.refreshTokens()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns new tokens on valid refresh token', async () => {
    mockRefreshSession.mockResolvedValue({
      data:  { session: MOCK_SESSION },
      error: null,
    });

    const result = await authService.refreshTokens('valid_refresh_token');

    expect(result.tokens.access_token).toBe('access_token_value');
    expect(result.tokens.refresh_token).toBe('refresh_token_value');
  });

  it('throws AuthenticationError on expired refresh token', async () => {
    mockRefreshSession.mockResolvedValue({
      data:  { session: null },
      error: { message: 'refresh token not found' },
    });

    await expect(authService.refreshTokens('expired_token')).rejects.toThrow(
      AuthenticationError,
    );
  });

  it('throws AuthenticationError on already-used refresh token', async () => {
    mockRefreshSession.mockResolvedValue({
      data:  { session: null },
      error: { message: 'Token has been already used' },
    });

    await expect(authService.refreshTokens('used_token')).rejects.toThrow(
      AuthenticationError,
    );
  });

  it('throws AuthenticationError when session is null despite no error', async () => {
    mockRefreshSession.mockResolvedValue({
      data:  { session: null },
      error: null,
    });

    await expect(authService.refreshTokens('weird_token')).rejects.toThrow(
      AuthenticationError,
    );
  });
});

describe('AuthService.logout()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls signOut with global scope', async () => {
    mockAdminSignOut.mockResolvedValue({ error: null });

    await authService.logout(MOCK_USER_ID, '1.2.3.4');

    expect(mockAdminSignOut).toHaveBeenCalledWith(MOCK_USER_ID, 'global');
  });

  it('calls audit log on logout', async () => {
    mockAdminSignOut.mockResolvedValue({ error: null });

    await authService.logout(MOCK_USER_ID, '1.2.3.4');

    expect(mockAuditLogLogout).toHaveBeenCalledWith(MOCK_USER_ID, '1.2.3.4');
  });

  it('does not throw if Supabase signOut fails (token expires naturally)', async () => {
    mockAdminSignOut.mockResolvedValue({
      error: { message: 'session not found' },
    });

    // Should NOT throw
    await expect(authService.logout(MOCK_USER_ID, '1.2.3.4')).resolves.toBeUndefined();
  });
});

describe('AuthService.updateFcmToken()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates FCM token successfully', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    });

    await expect(
      authService.updateFcmToken(MOCK_USER_ID, 'new_fcm_token'),
    ).resolves.toBeUndefined();
  });

  it('clears FCM token when null is passed', async () => {
    const mockUpdateChain = {
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    };
    mockFrom.mockReturnValue(mockUpdateChain);

    await authService.updateFcmToken(MOCK_USER_ID, null);

    expect(mockUpdateChain.update).toHaveBeenCalledWith({ fcm_token: null });
  });

  it('throws ExternalServiceError on DB failure', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
    });

    await expect(
      authService.updateFcmToken(MOCK_USER_ID, 'token'),
    ).rejects.toThrow(ExternalServiceError);
  });
});

describe('AuthService.changePassword()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('changes password successfully and revokes all sessions', async () => {
    // Re-authentication succeeds
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    // Password update succeeds
    mockAdminUpdateUser.mockResolvedValue({ data: {}, error: null });
    // Session revocation succeeds
    mockAdminSignOut.mockResolvedValue({ error: null });

    await expect(
      authService.changePassword(
        MOCK_USER_ID,
        MOCK_EMAIL,
        {
          current_password: 'OldPass1!',
          new_password:     'NewPass1!',
          confirm_password: 'NewPass1!',
        },
        '1.2.3.4',
      ),
    ).resolves.toBeUndefined();

    expect(mockAdminSignOut).toHaveBeenCalledWith(MOCK_USER_ID, 'global');
  });

  it('throws AuthenticationError when current password is wrong', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    await expect(
      authService.changePassword(
        MOCK_USER_ID,
        MOCK_EMAIL,
        { current_password: 'wrong', new_password: 'NewPass1!', confirm_password: 'NewPass1!' },
        '1.2.3.4',
      ),
    ).rejects.toThrow(AuthenticationError);
  });

  it('error message for wrong current password is specific, not generic', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    const err = await authService
      .changePassword(MOCK_USER_ID, MOCK_EMAIL, {
        current_password: 'wrong',
        new_password:     'NewPass1!',
        confirm_password: 'NewPass1!',
      }, '1.2.3.4')
      .catch((e: Error) => e);

    expect((err as AuthenticationError).message).toContain('Current password');
  });

  it('throws ExternalServiceError when password update fails on Supabase side', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    mockAdminUpdateUser.mockResolvedValue({
      data:  null,
      error: { message: 'Update failed' },
    });

    await expect(
      authService.changePassword(
        MOCK_USER_ID,
        MOCK_EMAIL,
        { current_password: 'OldPass1!', new_password: 'NewPass1!', confirm_password: 'NewPass1!' },
        '1.2.3.4',
      ),
    ).rejects.toThrow(ExternalServiceError);
  });

  it('does not throw if session revocation after password change fails', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    mockAdminUpdateUser.mockResolvedValue({ data: {}, error: null });
    // Session revocation fails — should be non-fatal
    mockAdminSignOut.mockResolvedValue({ error: { message: 'signout failed' } });

    await expect(
      authService.changePassword(
        MOCK_USER_ID,
        MOCK_EMAIL,
        { current_password: 'OldPass1!', new_password: 'NewPass1!', confirm_password: 'NewPass1!' },
        '1.2.3.4',
      ),
    ).resolves.toBeUndefined();
  });

  it('calls audit service after successful password change', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data:  { user: MOCK_AUTH_USER, session: MOCK_SESSION },
      error: null,
    });
    mockAdminUpdateUser.mockResolvedValue({ data: {}, error: null });
    mockAdminSignOut.mockResolvedValue({ error: null });

    await authService.changePassword(
      MOCK_USER_ID,
      MOCK_EMAIL,
      { current_password: 'OldPass1!', new_password: 'NewPass1!', confirm_password: 'NewPass1!' },
      '1.2.3.4',
    );

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'user_password_changed' }),
    );
  });
});
