import { Router } from 'express';

import { authenticate } from '../../middleware/authenticate';

import {
  googleLogin,
  googleCallback,
  microsoftLogin,
  microsoftCallback,
  refresh,
  logoutHandler,
  logoutAll,
  me,
} from './auth.controller';
import {
  startImpersonation,
  exitImpersonation,
} from './impersonate.controller';


export const authRouter = Router();

// ── Google ─────────────────────────────────────────────────────────────────
authRouter.get('/google', googleLogin);
authRouter.get('/google/callback', googleCallback);

// ── Microsoft ──────────────────────────────────────────────────────────────
authRouter.get('/microsoft', microsoftLogin);
authRouter.get('/microsoft/callback', microsoftCallback);

// ── Session ────────────────────────────────────────────────────────────────
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logoutHandler);
authRouter.post('/logout-all', logoutAll);
authRouter.get( '/me', authenticate, me );

// ── Impersonation (solo super_admin) ───────────────────────────────────────
authRouter.post('/impersonate/exit', authenticate, exitImpersonation);
authRouter.post('/impersonate/:orgId', authenticate, startImpersonation);