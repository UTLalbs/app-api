// Mapeo de NHTSA `BodyClass` → SAT `c_SubTipoRem` (CTR###).
//
// Cuando el endpoint /trailers/decode-vin obtiene el BodyClass de NHTSA,
// sugerimos al usuario el subtipo CTR equivalente. Es solo una sugerencia —
// el operador siempre confirma o sobreescribe.

export const NHTSA_BODYCLASS_TO_CTR: Record<string, string> = {
	"Van Trailer": "CTR007", // Caja Seca
	"Van Body": "CTR007",
	"Refrigerated Van Trailer": "CTR006", // Caja Refrigerada
	"Refrigerated Van": "CTR006",
	"Flatbed Trailer": "CTR021", // Plataforma
	"Flatbed/Stake Bed": "CTR021",
	"Tank Trailer": "CTR028", // Tanque
	"Tank/Cargo Tank": "CTR028",
	"Container Chassis Trailer": "CTR010", // Chasis Portacontenedor
	"Intermodal Container Chassis": "CTR010",
	"Dump Trailer": "CTR031", // Volteo
	"Lowboy Trailer": "CTR009", // Cama Baja
	"Drop Deck / Step Deck": "CTR009",
	"Curtain-side Trailer": "CTR023", // Plataforma Encortinada
	"Hopper Trailer": "CTR029", // Tolva
	"Car Hauler": "CTR014", // Góndola Madrina
	"Auto Transporter": "CTR014",
	"Livestock Trailer": "CTR018", // Jaula
	"Logging Trailer": "CTR013", // Estacas (aproximación)
	"Pole Trailer": "CTR013",
};

export function suggestCtrFromBodyClass(
	bodyClass: string | null | undefined,
): string | null {
	if (!bodyClass) return null;
	const trimmed = bodyClass.trim();
	return NHTSA_BODYCLASS_TO_CTR[trimmed] ?? null;
}
