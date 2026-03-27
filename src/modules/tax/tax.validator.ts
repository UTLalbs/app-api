import { z } from 'zod';

// ── Código Postal ──────────────────────────────────────────────────────────

export const postalCodeParamSchema = z.object({
  params: z.object({
    cp: z
      .string()
      .length(5, 'El código postal debe tener 5 dígitos')
      .regex(/^\d{5}$/, 'El código postal solo debe contener números'),
  }),
});

// ── Validación RFC ─────────────────────────────────────────────────────────

export const validateRFCSchema = z.object({
  body: z.object({
    rfc: z
      .string()
      .min(12, 'RFC debe tener mínimo 12 caracteres')
      .max(13, 'RFC debe tener máximo 13 caracteres')
      .regex(
        /^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/,
        'Formato de RFC inválido',
      ),
    nombreRazonSocial: z
      .string()
      .min(1, 'Nombre o razón social es requerido')
      .max(300),
    regimenFiscal: z
      .string()
      .nullable()
      .optional(),
    codigoPostal: z
      .string()
      .length(5, 'El código postal debe tener 5 dígitos')
      .regex(/^\d{5}$/, 'El código postal solo debe contener números'),
  }),
});

// ── Tipos inferidos ────────────────────────────────────────────────────────

export type PostalCodeParamInput = z.infer<typeof postalCodeParamSchema>;
export type ValidateRFCInput     = z.infer<typeof validateRFCSchema>;