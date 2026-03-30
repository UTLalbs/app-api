import type {Request, Response} from "express";

import {asyncHandler} from "../../shared/utils/asyncHandler";

import {
	getUserById,
	listUsers,
	registerUser,
	editUser,
	changeUserStatus,
	removeUser,
} from "./user.service";
import type {UserQueryFilter, UserStatus} from "./user.types";
import type {
	ChangeStatusInput,
	CreateUserInput,
	ListUsersInput,
	UpdateUserInput,
} from "./user.validator";

export const getUser = asyncHandler(async (req: Request, res: Response) => {
	const user = await getUserById(String(req.params.id), req.user!.orgId ?? "");
	res.json({success: true, data: user});
});

export const getUsers = asyncHandler(
  async (req: Request & ListUsersInput, res: Response) => {
    const userType  = req.user!.userType;
    const orgId     = req.user!.orgId;
    const impersonating = req.user!.impersonating;

    // ── Construir accessFilter según userType ──────────────────────────
    let accessFilter: Record<string, unknown> = {};

    if (userType === 'super_admin') {
      if (impersonating) {
        // super_admin CON impersonation → usuarios de la org impersonada
        accessFilter = {
          orgId:    impersonating.orgId,
          userType: { $ne: 'super_admin' },
        };
      } else {
        // super_admin SIN impersonation → solo super_admins
        accessFilter = {
          userType: 'super_admin',
        };
      }
    } else {
      // Usuario normal → usuarios de su org, excluir super_admins
      accessFilter = {
        orgId:    orgId ?? '',
        userType: { $ne: 'super_admin' },
      };
    }

    // ── Construir filter ───────────────────────────────────────────────
    const filter: UserQueryFilter = {
      status:   req.query.status   as string | undefined,
      userType: req.query.userType as string | undefined,
      isGroup:  req.query.isGroup === 'true'
        ? true
        : req.query.isGroup === 'false'
          ? false
          : undefined,
    };

    const { users, total } = await listUsers(filter, accessFilter);

    res.json({ success: true, data: users, meta: { total } });
  },
);

export const createUser = asyncHandler(
	async (req: Request & CreateUserInput, res: Response) => {
		const user = await registerUser({
			email: req.body.email,
			displayName: req.body.displayName,
			firstName: req.body.firstName,
			lastName: req.body.lastName,
			phones: req.body.phones,
			orgId: req.user!.orgId ?? "",
			userType: req.body.userType,
			roles: req.body.roles,
			clientId: req.body.clientId,
			employeeProfile: req.body.employeeProfile,
			clientMemberships: req.body.clientMemberships,
		});
		res.status(201).json({success: true, data: user});
	},
);

export const updateUser = asyncHandler(
	async (req: Request & UpdateUserInput, res: Response) => {
		const user = await editUser(String(req.params.id), req.user!.orgId ?? "", {
			displayName: req.body.displayName,
			firstName: req.body.firstName,
			lastName: req.body.lastName,
			phones: req.body.phones,
			roles: req.body.roles,
			clientId: req.body.clientId,
			preferences: req.body.preferences,
			employeeProfile: req.body.employeeProfile,
			clientMemberships: req.body.clientMemberships,
		});
		res.json({success: true, data: user});
	},
);

export const updateUserStatus = asyncHandler(
	async (req: Request & ChangeStatusInput, res: Response) => {
		const user = await changeUserStatus(
			String(req.params.id),
			req.user!.orgId ?? "",
			req.body.status as UserStatus,
			req.user!.id,
		);
		res.json({success: true, data: user});
	},
);

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
	await removeUser(String(req.params.id), req.user!.orgId ?? "", req.user!.id);
	res.status(204).send();
});
