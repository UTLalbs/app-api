import { ObjectId } from 'mongodb';

// Crea un ObjectId validando el string primero.
// Devuelve null si el string no es un ObjectId válido —
// los repositories usan esto para devolver "no encontrado" en lugar de lanzar BSONError.
export function toObjectIdOrNull(id: string | null | undefined): ObjectId | null {
  if (!id || !ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}
