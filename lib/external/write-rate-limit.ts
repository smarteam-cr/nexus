import "server-only";

/**
 * lib/external/write-rate-limit.ts
 *
 * Throttle EN MEMORIA de las escrituras de un cliente externo (hoy: asignar franja a
 * sesión). A diferencia de `verify-rate-limit.ts` —que está PERSISTIDO porque protege
 * contra fuerza bruta de contraseña y un redeploy no puede resetearle el contador a un
 * atacante— acá el llamador ya está autenticado por su token: esto solo evita el
 * martilleo accidental (un drag con jitter, una pestaña loopeando). Perder el contador
 * en un restart no tiene consecuencia de seguridad.
 */
const WINDOW_MS = 60_000;
const MAX_WRITES = 30;

const hits = new Map<string, number[]>();

/** `true` si la escritura entra en la ventana; `false` si hay que rechazarla. */
export function checkExternalWriteRate(token: string, now: number = Date.now()): boolean {
  const cutoff = now - WINDOW_MS;
  const recent = (hits.get(token) ?? []).filter((t) => t > cutoff);
  if (recent.length >= MAX_WRITES) {
    hits.set(token, recent);
    return false;
  }
  recent.push(now);
  hits.set(token, recent);

  // Poda barata: si el mapa creció, tirar los tokens sin actividad en la ventana.
  if (hits.size > 500) {
    for (const [k, v] of hits) if (!v.some((t) => t > cutoff)) hits.delete(k);
  }
  return true;
}
