/**
 * lib/api/fetch-json.ts
 *
 * Helper cliente para `fetch` + normalización de errores (F0.2). Centraliza la
 * lectura del cuerpo de error que hoy cada componente hace ad-hoc
 * (`data.error ?? data.message ?? data.details?.[0]`). Si la respuesta no es ok,
 * lanza `ApiError` con el mensaje legible + el status + el payload crudo, pensado
 * para usarse dentro de un try/catch que reporta con `toast.error(e.message)`.
 *
 *   try {
 *     const data = await fetchJson<{ ok: boolean }>("/api/...", { method: "POST" });
 *   } catch (e) {
 *     toast.error(e instanceof ApiError ? e.message : "Error de conexión.");
 *   }
 */

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

const FALLBACK = "Ocurrió un error. Probá de nuevo.";

/** Extrae el mensaje legible de un cuerpo de error (las 3 formas que conviven hoy). */
export function extractErrorMessage(payload: unknown, fallback = FALLBACK): string {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    // `message` (humano) tiene prioridad sobre `error` (que a veces es un código seco).
    if (typeof p.message === "string" && p.message.trim()) return p.message;
    if (typeof p.error === "string" && p.error.trim()) return p.error;
    const details = p.details;
    if (Array.isArray(details) && typeof details[0] === "string") return details[0];
  }
  return fallback;
}

/**
 * `fetch` + JSON con error normalizado. Devuelve el cuerpo parseado tipado como T
 * (o `{}` si el cuerpo no es JSON). Lanza `ApiError` si `!res.ok` o si falla la red.
 */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new ApiError("Error de conexión. Revisá tu internet.", 0, null);
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(extractErrorMessage(payload), res.status, payload);
  }
  return payload as T;
}
