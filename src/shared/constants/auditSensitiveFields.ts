// Campos PII o secretos que NUNCA deben guardarse en claro en audit.
// El helper `computeDiff` los enmascara automáticamente.
//
// Si agregas un campo nuevo PII al modelo, añádelo aquí.
export const AUDIT_SENSITIVE_FIELDS: ReadonlySet<string> = new Set<string>([
  // identificadores fiscales
  'rfc',
  'curp',
  'nss',
  'taxId',
  // bancarios
  'bankAccount',
  'bankCard',
  'clabe',
  // secretos de auth
  'passwordHash',
  'password',
  'mfaSecret',
  'refreshToken',
  'accessToken',
  // archivos subidos con URL firmada
  'fileUrl',
  'presignedUrl',
]);

export const AUDIT_MASKED_VALUE = '***';
