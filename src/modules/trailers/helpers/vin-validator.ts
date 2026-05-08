// VIN validator (ISO 3779 / FMVSS 115).
//
// Reglas:
// 1. Exactamente 17 caracteres alfanuméricos en mayúsculas.
// 2. No contiene las letras I, O ni Q (para evitar confusión con 1 y 0).
// 3. El dígito verificador en posición 9 (índice 8) cuadra con el algoritmo
//    de pesos.
//
// IMPORTANTE: muchos remolques de fabricantes mexicanos NO cumplen el dígito
// verificador. El service que use este helper debe decidir si lo trata como
// hard error o como warning. El endpoint `POST /trailers/decode-vin` SÍ rompe
// con dígito inválido (porque ahí el usuario está validando antes de llamar
// a NHTSA); el alta `POST /trailers` solo valida formato (regex), no dígito.

export interface VinValidationResult {
	valid: boolean;
	reason?:
		| "wrong_length"
		| "invalid_chars"
		| "forbidden_letter"
		| "invalid_check_digit";
	expectedCheckDigit?: string;
}

const FORBIDDEN = /[IOQ]/;
const ALPHANUM_UPPER = /^[A-Z0-9]+$/;

// Tablas de transliteración por posición del carácter (ISO 3779).
const LETTER_VALUES: Record<string, number> = {
	A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
	J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
	S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

const POSITION_WEIGHTS = [
	8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2,
];
//                              ↑ position 9: peso 0 (ese ES el dígito verificador)

function transliterate(ch: string): number {
	if (ch >= "0" && ch <= "9") return Number(ch);
	return LETTER_VALUES[ch] ?? 0;
}

export function calculateCheckDigit(vin: string): string {
	let sum = 0;
	for (let i = 0; i < 17; i++) {
		sum += transliterate(vin[i]!) * POSITION_WEIGHTS[i]!;
	}
	const mod = sum % 11;
	return mod === 10 ? "X" : String(mod);
}

export function validateVin(rawVin: string): VinValidationResult {
	const vin = rawVin.toUpperCase().trim();

	if (vin.length !== 17) {
		return {valid: false, reason: "wrong_length"};
	}
	if (!ALPHANUM_UPPER.test(vin)) {
		return {valid: false, reason: "invalid_chars"};
	}
	if (FORBIDDEN.test(vin)) {
		return {valid: false, reason: "forbidden_letter"};
	}
	const expected = calculateCheckDigit(vin);
	if (vin[8] !== expected) {
		return {
			valid: false,
			reason: "invalid_check_digit",
			expectedCheckDigit: expected,
		};
	}
	return {valid: true};
}

// ── Disambiguación de año por posición 7 (ISO 3779) ──────────────────────
//
// El carácter en posición 10 codifica el año, pero hay ambigüedad porque el
// alfabeto se recicla cada 30 años (R = 1994 ó 2024). La regla es:
//   - Si pos 7 es NÚMERO → la unidad es del ciclo 1980-2009.
//   - Si pos 7 es LETRA → la unidad es del ciclo 2010-2039.
//
// NHTSA aplica esta regla inconsistentemente para remolques. Por eso la
// hacemos local y comparamos contra lo que NHTSA devolvió.

const YEAR_CODES: Record<string, number> = {
	A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7,
	J: 8, K: 9, L: 10, M: 11, N: 12, P: 13, R: 14,
	S: 15, T: 16, V: 17, W: 18, X: 19, Y: 20,
	"1": 21, "2": 22, "3": 23, "4": 24, "5": 25, "6": 26, "7": 27, "8": 28, "9": 29,
};

export function inferYearFromVin(rawVin: string): number | null {
	const vin = rawVin.toUpperCase().trim();
	if (vin.length !== 17) return null;
	const yearChar = vin[9]!; // position 10 (index 9)
	const dismbig = vin[6]!; // position 7 (index 6)
	const offset = YEAR_CODES[yearChar];
	if (offset === undefined) return null;
	// Si pos 7 es NÚMERO → ciclo 1980-2009 (base 1980)
	// Si pos 7 es LETRA → ciclo 2010-2039 (base 2010)
	const isNewCycle = /[A-Z]/.test(dismbig);
	const base = isNewCycle ? 2010 : 1980;
	return base + offset;
}
