import { Router } from 'express';

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
authRouter.get('/me', me);