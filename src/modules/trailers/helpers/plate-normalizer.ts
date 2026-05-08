/**
 * Normaliza una placa vehicular:
 *   - mayúsculas
 *   - elimina espacios, guiones, puntos
 *   - conserva solo letras y números
 *
 * Aplica a placas MX (formato SAT `[^(?!.*\s)-]{6,7}`) y US (varía por estado,
 * pero la regla "alfanumérico mayúsculas" funciona para ambos).
 */
export function normalizePlate(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
	return cleaned.length === 0 ? null : cleaned;
}

/** Valida formato SAT para placas mexicanas. 6-7 caracteres alfanuméricos. */
export function isValidMxPlate(plate: string): boolean {
	return /^[A-Z0-9]{6,7}$/.test(plate);
}

/** Valida formato US — flexible: 1 a 8 caracteres alfanuméricos. */
export function isValidUsPlate(plate: string): boolean {
	return /^[A-Z0-9]{1,8}$/.test(plate);
}
