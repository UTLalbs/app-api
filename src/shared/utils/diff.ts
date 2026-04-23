import type { AuditDiff } from '../../modules/audit/audit.types';
import {
  AUDIT_MASKED_VALUE,
  AUDIT_SENSITIVE_FIELDS,
} from '../constants/auditSensitiveFields';

type ObjectKey<T> = Extract<keyof T, string>;

interface ComputeDiffOptions<T> {
  allowedFields: readonly ObjectKey<T>[];
  // Override o extensión de campos sensibles; si no se pasa se usa AUDIT_SENSITIVE_FIELDS.
  sensitiveFields?: ReadonlySet<string>;
}

// Compara dos objetos campo por campo restringido a `allowedFields`.
// Retorna null si no hay cambios — el caller NO debe emitir evento de audit.
//
// Los campos en `sensitiveFields` (por default AUDIT_SENSITIVE_FIELDS) se enmascaran
// como '***' tanto en `old` como en `new`, conservando el flag `isMasked: true`
// para que la UI lo renderice con un indicador.
export function computeDiff<T extends object>(
  before: Partial<T> | null | undefined,
  after: Partial<T> | null | undefined,
  options: ComputeDiffOptions<T>,
): AuditDiff | null {
  const { allowedFields, sensitiveFields = AUDIT_SENSITIVE_FIELDS } = options;

  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;

  const diff: AuditDiff = {};

  for (const key of allowedFields) {
    // Si no aparece en ningún lado, no hay cambio.
    const inBefore = key in b;
    const inAfter = key in a;
    if (!inBefore && !inAfter) continue;

    const oldVal = b[key];
    const newVal = a[key];

    if (isEqual(oldVal, newVal)) continue;

    if (sensitiveFields.has(key)) {
      diff[key] = { old: AUDIT_MASKED_VALUE, new: AUDIT_MASKED_VALUE, isMasked: true };
    } else {
      diff[key] = { old: oldVal, new: newVal };
    }
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

// Comparación deep-equal simple: suficiente para scalars, arrays y objetos planos.
// No cubre Map/Set/Date con referencias distintas — los Date se comparan por valor ISO.
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => isEqual(item, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) =>
      isEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}
