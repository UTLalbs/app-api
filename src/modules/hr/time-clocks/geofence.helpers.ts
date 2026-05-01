import type { Geofence } from '../../locations/location.types';

import type { GeofenceStatus, ReportedLocation } from './time-clock.types';

// Tolerancia por defecto cuando la geocerca no especifica una propia. Se
// suma a la geometría exacta — un fichaje a 480m del borde de un círculo
// con radio 0 cuenta como dentro si la tolerancia es 500m.
export const DEFAULT_GEOFENCE_TOLERANCE_METERS = 500;

interface ComputeArgs {
  expectedGeofence: Geofence | null;
  reportedLocation: ReportedLocation | null;
  toleranceMeters?: number;
}

interface ComputeResult {
  geofenceStatus: GeofenceStatus;
  // Distancia desde el punto reportado hasta el borde más cercano de la
  // geocerca esperada. 0 si el punto está dentro. null si no hay referencia.
  distanceFromExpectedMeters: number | null;
}

export function computeGeofenceStatus(args: ComputeArgs): ComputeResult {
  const tolerance = args.toleranceMeters ?? DEFAULT_GEOFENCE_TOLERANCE_METERS;

  // Sin coordenadas reportadas (permiso denegado o sin GPS).
  if (!args.reportedLocation?.coordinates) {
    return { geofenceStatus: 'no_reference', distanceFromExpectedMeters: null };
  }

  // Sin geocerca esperada (sin schedule asociado o location sin geofence).
  if (!args.expectedGeofence) {
    return { geofenceStatus: 'no_reference', distanceFromExpectedMeters: null };
  }

  const [lng, lat] = args.reportedLocation.coordinates;
  const distance = distanceToGeofenceEdge(lat, lng, args.expectedGeofence);
  const isInside = distance <= tolerance;

  return {
    geofenceStatus: isInside ? 'inside' : 'outside',
    distanceFromExpectedMeters: Math.round(distance),
  };
}

// Distancia en metros desde un punto al borde más cercano de la geocerca.
// Devuelve 0 si el punto está dentro.
export function distanceToGeofenceEdge(
  lat: number,
  lng: number,
  geofence: Geofence,
): number {
  if (geofence.type === 'circle') {
    const distToCenter = haversineDistance(
      lat,
      lng,
      geofence.center.lat,
      geofence.center.lng,
    );
    return Math.max(0, distToCenter - geofence.radiusMeters);
  }

  // Polygon: si el punto está dentro retornar 0; si está fuera, distancia
  // mínima al borde (haversine al vértice más cercano sirve como aprox.
  // razonable para polígonos pequeños — para precisión total habría que
  // hacer punto-a-segmento, lo cual es overkill para ~100m de tolerancia).
  if (isPointInsidePolygon(lat, lng, geofence.points)) return 0;

  let minDist = Infinity;
  for (const p of geofence.points) {
    const d = haversineDistance(lat, lng, p.lat, p.lng);
    if (d < minDist) minDist = d;
  }
  return minDist === Infinity ? 0 : minDist;
}

// Distancia haversine en metros entre dos puntos lat/lng.
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Ray casting — copiado del módulo locations pero sin dependerlo (helper puro).
function isPointInsidePolygon(
  lat: number,
  lng: number,
  points: ReadonlyArray<{ lat: number; lng: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].lng;
    const yi = points[i].lat;
    const xj = points[j].lng;
    const yj = points[j].lat;
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
