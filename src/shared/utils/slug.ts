// Convierte un nombre a slug URL-safe:
//   "Unidos Transport" → "unidos-transport"
//   "San José 2.0"     → "san-jose-20"
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')                // descompone caracteres acentuados
    .replace(/[̀-ͯ]/g, '') // elimina diacríticos (tildes)
    .replace(/[^a-z0-9\s-]/g, '')    // elimina caracteres especiales
    .replace(/\s+/g, '-')            // espacios → guiones
    .replace(/-+/g, '-');            // múltiples guiones → uno solo
}
