// Características derivadas por subtipo de remolque (catálogo SAT c_SubTipoRem).
//
// IMPORTANTE: estos flags son **defaults razonables**, NO reglas duras. El
// frontend muestra los campos del Nivel 2 como "sugeridos según el subtipo"
// pero permite capturar siempre. Casos raros (una grúa en chasis con enganche
// semi) no se bloquean.
//
// Sincronizado con `app-web/src/lib/utils/trailerCharacteristics.ts` —
// SIEMPRE cambiar en pareja si se actualiza la lista.

export interface CtrCharacteristic {
	isSemiTrailer: boolean;
	hasEnclosedBody: boolean;
	category:
		| "box"
		| "flatbed"
		| "tank"
		| "dump"
		| "specialized"
		| "crane"
		| "chassis"
		| "livestock"
		| "mixer"
		| "other";
}

export const CTR_CHARACTERISTICS: Record<string, CtrCharacteristic> = {
	CTR001: {isSemiTrailer: false, hasEnclosedBody: false, category: "specialized"},
	CTR002: {isSemiTrailer: true, hasEnclosedBody: true, category: "box"},
	CTR003: {isSemiTrailer: true, hasEnclosedBody: false, category: "box"},
	CTR004: {isSemiTrailer: true, hasEnclosedBody: true, category: "box"},
	CTR005: {isSemiTrailer: true, hasEnclosedBody: true, category: "specialized"},
	CTR006: {isSemiTrailer: true, hasEnclosedBody: true, category: "box"},
	CTR007: {isSemiTrailer: true, hasEnclosedBody: true, category: "box"},
	CTR008: {isSemiTrailer: true, hasEnclosedBody: true, category: "box"},
	CTR009: {isSemiTrailer: true, hasEnclosedBody: false, category: "flatbed"},
	CTR010: {isSemiTrailer: true, hasEnclosedBody: false, category: "chassis"},
	CTR011: {isSemiTrailer: true, hasEnclosedBody: false, category: "chassis"},
	CTR012: {isSemiTrailer: true, hasEnclosedBody: false, category: "specialized"},
	CTR013: {isSemiTrailer: true, hasEnclosedBody: false, category: "flatbed"},
	CTR014: {isSemiTrailer: true, hasEnclosedBody: false, category: "specialized"},
	CTR015: {isSemiTrailer: false, hasEnclosedBody: false, category: "crane"},
	CTR016: {isSemiTrailer: false, hasEnclosedBody: false, category: "crane"},
	CTR017: {isSemiTrailer: false, hasEnclosedBody: true, category: "specialized"},
	CTR018: {isSemiTrailer: true, hasEnclosedBody: false, category: "livestock"},
	CTR019: {isSemiTrailer: true, hasEnclosedBody: false, category: "flatbed"},
	CTR020: {isSemiTrailer: true, hasEnclosedBody: false, category: "specialized"},
	CTR021: {isSemiTrailer: true, hasEnclosedBody: false, category: "flatbed"},
	CTR022: {isSemiTrailer: true, hasEnclosedBody: false, category: "crane"},
	CTR023: {isSemiTrailer: true, hasEnclosedBody: false, category: "flatbed"},
	CTR024: {isSemiTrailer: true, hasEnclosedBody: false, category: "flatbed"},
	CTR025: {isSemiTrailer: true, hasEnclosedBody: true, category: "box"},
	CTR026: {isSemiTrailer: false, hasEnclosedBody: false, category: "mixer"},
	CTR027: {isSemiTrailer: true, hasEnclosedBody: true, category: "box"},
	CTR028: {isSemiTrailer: true, hasEnclosedBody: false, category: "tank"},
	CTR029: {isSemiTrailer: true, hasEnclosedBody: false, category: "tank"},
	// CTR030 NO existe en el catálogo SAT
	CTR031: {isSemiTrailer: true, hasEnclosedBody: false, category: "dump"},
	CTR032: {isSemiTrailer: true, hasEnclosedBody: false, category: "dump"},
};

export function getCtrCharacteristic(
	ctrSubtype: string,
): CtrCharacteristic | undefined {
	return CTR_CHARACTERISTICS[ctrSubtype];
}
