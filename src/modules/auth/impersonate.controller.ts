import type { Request, Response } from 'express';

import { logger } from '../../config/logger';
import { AuthError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { buildAuditContext } from '../../shared/utils/auditContext';
import { emitAuditEvent } from '../audit/audit.service';
import { findOrganizationById } from '../organizations/organization.repository';
import { findUserById } from '../users/user.repository';

import {
  issueAccessToken,
  accessTokenCookieOptions,
  impersonateTokenCookieOptions
} from './token.service';


// ── POST /api/v1/auth/impersonate/:orgId ───────────────────────────────────
// Solo super_admin puede impersonar una organización
// Emite un nuevo access_token con el orgId de la organización
// El refresh_token NO cambia — al refrescar vuelve al estado original

export const startImpersonation = asyncHandler(
  async (req: Request, res: Response) => {
    // Verificar que es super_admin
    if (!req.user) throw new AuthError('Not authenticated');

    if (req.user.userType !== 'super_admin') {
      throw new ForbiddenError('Only super_admin can impersonate organizations');
    }

    const orgId = String(req.params.orgId);

    // Verificar que la organización existe y está activa
    const org = await findOrganizationById(orgId);

    if (!org) throw new NotFoundError('Organization');

    if (org.status !== 'active') {
      throw new ForbiddenError('Organization is not active');
    }

    // Obtener el usuario actualizado
    const user = await findUserById(req.user.id, '');
    if (!user) throw new AuthError('User not found');

    // Emitir nuevo access_token con impersonation data
    const accessToken = issueAccessToken(user, {
      orgId: org.id,
      orgName: org.name,
    });

    // Solo actualizamos el access_token — refresh_token queda igual
    res.cookie('access_token', accessToken, impersonateTokenCookieOptions);

    // Enriquecemos el contexto con la org destino — aunque el token nuevo todavía
    // no aplica en esta request, marcamos el evento como parte de la sesión
    // impersonada para que el dashboard pueda agrupar start → acciones → exit
    // filtrando por `impersonating.orgId`.
    const baseContext = buildAuditContext(req);
    await emitAuditEvent({
      category: 'auth',
      action: 'impersonation_start',
      target: { type: 'organization', id: org.id, displayName: org.name },
      context: {
        ...baseContext,
        orgId: org.id,
        impersonating: { orgId: org.id, orgName: org.name },
      },
    });

    logger.info(
      { userId: req.user.id, orgId: org.id, orgName: org.name },
      'Super admin started impersonation',
    );

    res.json({
      success: true,
      data: {
        orgId: org.id,
        orgName: org.name,
        impersonating: true,
      },
    });
  },
);

// ── POST /api/v1/auth/impersonate/exit ────────────────────────────────────
// Sale del modo impersonation
// Emite un nuevo access_token sin impersonation data

export const exitImpersonation = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AuthError('Not authenticated');

    if (req.user.userType !== 'super_admin') {
      throw new ForbiddenError('Only super_admin can exit impersonation');
    }

    if (!req.user.impersonating) {
      throw new ForbiddenError('Not currently impersonating any organization');
    }

    // Obtener usuario actualizado
    const user = await findUserById(req.user.id, '');
    if ( !user ) throw new AuthError( 'User not found' );
    
    // Invalidar cache para que el próximo request lea el JWT fresco
    const { invalidatePermissionsCache } = await import('../../middleware/authorize');
    const { getRedisClient } = await import('../../config/redis');
    await getRedisClient().del(`auth:user:${req.user.id}`);
    await invalidatePermissionsCache(req.user.id);

    // Emitir access_token limpio — sin impersonating
    const accessToken = issueAccessToken(user, null);

    res.cookie('access_token', accessToken, accessTokenCookieOptions);

    // Al momento de emitir este evento `req.user.impersonating` todavía refleja
    // la sesión impersonada vigente — buildAuditContext lo copia al top-level
    // `impersonating` para que el dashboard sepa bajo qué org se ejecutó el exit.
    await emitAuditEvent({
      category: 'auth',
      action: 'impersonation_exit',
      target: {
        type: 'organization',
        id: req.user.impersonating.orgId,
        displayName: req.user.impersonating.orgName,
      },
      context: buildAuditContext(req),
    });

    logger.info(
      { userId: req.user.id },
      'Super admin exited impersonation',
    );

    res.json({
      success: true,
      data: {
        impersonating: false,
      },
    });
  },
);