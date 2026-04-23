# notifications

Feed de notificaciones por usuario. Se crea desde otros módulos (tasks, employees)
y se consume por el frontend.

## Endpoints

Prefijo: `/api/v1/notifications` · Requiere `authenticate` + `rateLimiter`.

Ver `notification.routes.ts` para el listado completo (listar, marcar leída,
eliminar).

## Colección

**Colección**: `notifications`

Tipos (`NotificationType`): `assignment`, `status_change`, `system`, `reminder`, etc.

Campos clave: `userId` (destinatario), `orgId`, `type`, `taskId`, `taskTitle`,
`message`, `fromUserId`, `fromUserName`, `readAt`, `createdAt`.

## Reglas de negocio

- Las notificaciones se borran en cascada cuando se elimina un task
  (`deleteNotificationsByTaskId` llamado desde `task.service.removeTask`).
- El destinatario siempre es un `userId` individual — no hay broadcast a role.

## Dependencias

- Consumido por: `tasks`, `hr/employees` (alerts job).
