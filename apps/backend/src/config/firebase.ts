/**
 * firebase.ts — Firebase Admin SDK singleton.
 *
 * Firebase Admin SDK must be initialized exactly once per process.
 * Subsequent calls to initializeApp() throw if an app is already initialized.
 * This module enforces the singleton contract.
 *
 * Used by: notification.service.ts (FCM push dispatch)
 */

import admin from 'firebase-admin';

import { logger } from '../utils/logger.js';

import { env, isTest } from './env.js';

let _app: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App {
  if (_app) return _app;

  // In test environment, return a mock-friendly stub rather than
  // attempting real Firebase initialization with test credentials.
  if (isTest) {
    // Tests that need Firebase should mock this function directly.
    // Returning a null here will cause FCM calls to be skipped in test mode.
    _app = admin.apps[0] ?? admin.initializeApp({ projectId: 'test-project' });
    return _app;
  }

  try {
    _app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey:  env.FIREBASE_PRIVATE_KEY,
      }),
    });

    logger.info({ projectId: env.FIREBASE_PROJECT_ID }, 'Firebase Admin SDK initialized');
  } catch (err) {
    // initializeApp throws if an app already exists — retrieve the existing one
    if (admin.apps.length > 0 && admin.apps[0]) {
      _app = admin.apps[0];
    } else {
      logger.error({ err }, 'Failed to initialize Firebase Admin SDK');
      throw err;
    }
  }

  return _app;
}

// ─── FCM messaging helper ─────────────────────────────────────────────────────
// Returns the Firebase Messaging instance, ensuring the app is initialized first.
export function getFirebaseMessaging(): admin.messaging.Messaging {
  return admin.messaging(getFirebaseApp());
}

// ─── Health check ─────────────────────────────────────────────────────────────
export function checkFirebaseHealth(): { ok: boolean } {
  try {
    getFirebaseApp();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
