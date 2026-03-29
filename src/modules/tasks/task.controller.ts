import type { Request, Response } from 'express';
import { ObjectId } from 'mongodb';

import { asyncHandler } from '../../shared/utils/asyncHandler';

import {
  submitTask,
  getTask,
  listTasks,
  editTask,
  removeTask,
} from './task.service';
import type { TaskArea, TaskPriority, TaskQueryFilter, TaskStatus, TaskType } from './task.types';
import type {
  CreateTaskInput,
  ListTasksInput,
  UpdateTaskInput,
} from './task.validator';

// ── GET /api/v1/tasks ──────────────────────────────────────────────────────

export const getTasks = asyncHandler(
  async (req: Request & ListTasksInput, res: Response) => {
    // Construir filtro de acceso según userType
    let accessFilter: Record<string, unknown> = {};

    if (req.user!.userType === 'super_admin') {
      // super_admin ve tasks de area='development'
      // O donde aparece en participants
      accessFilter = {
        $or: [
          { area: 'development' },
          { participants: new ObjectId(req.user!.id) },
        ],
      };
    } else {
      // otros usuarios ven tasks de su orgId
      accessFilter = {
        orgId: new ObjectId(req.user!.orgId ?? ''),
      };
    }

    const filter: TaskQueryFilter = {
      status:     req.query.status     as TaskStatus   | undefined,
      priority:   req.query.priority   as TaskPriority | undefined,
      area:       req.query.area       as TaskArea     | undefined,
      type:       req.query.type       as TaskType     | undefined,
      assignedTo: req.query.assignedTo as string       | undefined,
    };

    const { tasks, total } = await listTasks(filter, accessFilter);

    res.json({ success: true, data: tasks, meta: { total } });
  },
);

// ── POST /api/v1/tasks ─────────────────────────────────────────────────────

export const createTask = asyncHandler(
  async (req: Request & CreateTaskInput, res: Response) => {
    const { task, isDuplicate } = await submitTask(
      {
        orgId:        req.user!.orgId ?? null,
        type:         req.body.type,
        source:       'user',
        sourceId:     req.body.sourceId ?? null,
        title:        req.body.title,
        description:  req.body.description,
        priority:     req.body.priority,
        area:         req.body.area,
        assignedTo:   req.body.assignedTo ?? null,
        assignedBy:   req.user!.id,
        participants: req.body.participants ?? [],
        status:       'open',
        entity:       req.body.entity,
        entityId:     req.body.entityId,
        entityName:   req.body.entityName,
        dueDate:      req.body.dueDate ?? null,
        metadata:     req.body.metadata ?? {},
      },
      req.user!.displayName,
    );

    res.status(isDuplicate ? 200 : 201).json({
      success: true,
      data: task,
      ...(isDuplicate && { duplicate: true }),
    });
  },
);

// ── GET /api/v1/tasks/:id ──────────────────────────────────────────────────

export const getTaskById = asyncHandler(
  async (req: Request, res: Response) => {
    const task = await getTask(String(req.params.id));
    res.json({ success: true, data: task });
  },
);

// ── PATCH /api/v1/tasks/:id ────────────────────────────────────────────────

export const updateTask = asyncHandler(
  async (req: Request & UpdateTaskInput, res: Response) => {
    const task = await editTask(
      String(req.params.id),
      {
        status:       req.body.status,
        priority:     req.body.priority,
        assignedTo:   req.body.assignedTo,
        participants: req.body.participants,
        dueDate:      req.body.dueDate,
      },
      req.user!.id,
      req.user!.displayName,
    );

    res.json({ success: true, data: task });
  },
);

// ── DELETE /api/v1/tasks/:id ───────────────────────────────────────────────

export const deleteTask = asyncHandler(
  async (req: Request, res: Response) => {
    await removeTask(String(req.params.id));
    res.status(204).send();
  },
);