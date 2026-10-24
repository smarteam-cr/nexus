/**
 * lib/hubspot/transporte.ts — CÓMO SE LE PIDE ALGO A HUBSPOT: el token, el 401 y el 429 (U6, 2026-10-24).
 *
 * Hasta el 2026-10-24 cada lector se las arreglaba solo: el reintento ante un 401 estaba copiado en 14 lugares, el
 * bloque de refrescar y guardar el token en 5, y ante un 429 solo esperaba la auditoría (`lib/auditoria-portal/
 * lecturas.ts`, el molde de esto). Ahora hay UN pedido: lo usa el cliente del SDK que devuelven
 * `getSystemHubspotClient` y `getHubspotClient` (lib/hubspot/client.ts), así que los ~90 llamadores lo tienen sin
 * cambiar una línea. Plan: docs/integracion-hubspot-plan.md › U6.
 *
 * ── LO QUE HACE ──────────────────────────────────────────────────────────────
 * - **401:** pide a la credencial un token nuevo y reintenta UNA vez. La credencial (client.ts) junta los pedidos que
 *   llegan a la vez en un solo refresh. Si ni con el token nuevo entra, devuelve ese 401: el llamador decide.
 * - **429:** espera lo que diga `Retry-After` (si no viene, 1 s, 2 s, 4 s…) y reintenta, mientras quepa en el
 *   presupuesto. Un 429 que no cabe vuelve tal cual. Mientras tanto frena a los demás pedidos del proceso: reintentar
 *   en paralelo contra un límite ya agotado solo lo alarga.
 * - **Los encabezados del límite** (`X-HubSpot-RateLimit-Remaining` / `-Max` / `-Interval-Milliseconds`): con el
 *   cupo casi agotado, espacia los pedidos siguientes en vez de chocar contra el 429.
 *
 * ── EL CONTRATO DE ERRORES NO CAMBIA ─────────────────────────────────────────
 * ⛔ Nunca convierte un status en otro ni lanza por uno: un 429 agotado vuelve como 429 (y quien lanzaba ante él, como
 * `contactos-y-tickets.ts` o `cs-signals.ts`, sigue lanzando), un 403 vuelve como 403 sin reintento («sin permiso»).
 * Un error de red sube como antes. Solo reintenta lo que HubSpot no procesó (401 y 429), así que es seguro para un
 * POST que escribe.
 *
 * ⚠ No importa nada de Nexus (ni base ni Next): el `fetch`, la espera y el reloj se inyectan, y las pruebas lo
 * ejercitan con un `fetch` falso (`transporte.test.ts`).
 */

/** Sin exportar a propósito: quien necesite la URL de la API está armando un pedido fuera del transporte. */
const BASE_DE_HUBSPOT = "https://api.hubapi.com";

/** Lo que se le pide a HubSpot: la misma forma que `apiRequest` del SDK (IHttpOptions), para no tocar llamadores. */
export interface PedidoAHubspot {
  method?: string;
  path?: string;
  qs?: Record<string, string> | URLSearchParams | string;
  body?: unknown;
  headers?: Record<string, string>;
  /** false = el cuerpo ya viene serializado y no se pone `Content-Type: application/json` (como en el SDK). */
  defaultJson?: boolean;
}

/** Cuánto puede esperar un pedido ante el límite de HubSpot. */
export interface Presupuesto {
  /** El total que puede sumar esperando (por 429 y por el freno compartido). */
  esperaTotalMs: number;
  /** Una espera que pida más que esto no se hace: el 429 vuelve. */
  esperaMaximaMs: number;
  /** Cuántos 429 seguidos se reintentan como mucho. */
  reintentos429: number;
}

/** En una ruta del usuario: 2 s como máximo, y degrada (ARCHITECTURE §7, regla 2). */
export const PRESUPUESTO_DE_RUTA: Presupuesto = { esperaTotalMs: 2_000, esperaMaximaMs: 2_000, reintentos429: 2 };

/**
 * En un job (o un script): lo que diga `Retry-After`. El límite de la app es de 10 s (110 llamadas cada 10 s), así que
 * una espera de más de un minuto no es ese límite sino otro (el diario, o un portal caído): esa no se espera.
 */
export const PRESUPUESTO_DE_JOB: Presupuesto = { esperaTotalMs: 180_000, esperaMaximaMs: 60_000, reintentos429: 5 };

/** El token con el que se pide y cómo renovarlo. La implementa client.ts (con la base); las pruebas, a mano. */
export interface Credencial {
  /** El token vigente. */
  token(): Promise<string> | string;
  /**
   * Un token nuevo después de que HubSpot rechazó `rechazado` con un 401. Puede lanzar (el refresh falló): entonces
   * el pedido devuelve el 401. null = esta credencial no se renueva (un token suelto, sin cuenta guardada).
   */
  renovar: ((rechazado: string) => Promise<string>) | null;
}

/** Lo que el transporte avisa para que alguien lo cuente (client.ts lo guarda por día: `registro-de-fallas.ts`). */
export interface EventosDelTransporte {
  /** Un pedido llegó a HubSpot (cada intento cuenta). */
  pedido?(): void;
  /** HubSpot respondió 401 (antes de intentar renovar). */
  visto401?(): void;
  /** Se renovó el token después de un 401. */
  renovado?(): void;
  /** Un 401 volvió al llamador: no hubo cómo renovar, el refresh falló, o ni con el token nuevo entró. */
  falla401?(): void;
  /** HubSpot respondió 429; `esperaMs` es lo que se va a esperar (0 si no se reintenta). */
  visto429?(esperaMs: number): void;
  /** Un 429 volvió al llamador: no cupo en el presupuesto. */
  falla429?(): void;
  /** Lo que quedaba del cupo según `X-HubSpot-RateLimit-Remaining`. */
  cupo?(restante: number): void;
}

export interface DependenciasDelTransporte {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  esperar: (ms: number) => Promise<void>;
  ahora: () => number;
  eventos?: EventosDelTransporte;
  /** El freno compartido entre pedidos del mismo proceso. Las pruebas pasan uno propio. */
  freno?: Freno;
}

/**
 * Hasta cuándo conviene no pedir nada. Lo comparten todos los pedidos del proceso: cuando uno recibe un 429, los demás
 * esperan con él en vez de chocar también.
 */
export interface Freno {
  hasta: number;
}

export const frenoDelProceso: Freno = { hasta: 0 };

/** La URL y el `RequestInit` de un pedido, igual que los arma el SDK (services/http/Request.js). */
export function armarPedido(pedido: PedidoAHubspot, token: string): { url: string; init: RequestInit } {
  // `overlapUrl` y `authType` del SDK no los usa nadie en Nexus: mejor un error que un pedido distinto en silencio.
  const extra = pedido as { overlapUrl?: unknown; authType?: unknown };
  if (extra.overlapUrl !== undefined || extra.authType !== undefined) {
    throw new Error("El transporte de HubSpot no soporta overlapUrl ni authType: usa path y el token de la cuenta.");
  }
  const url = new URL(BASE_DE_HUBSPOT + (pedido.path ?? ""));
  if (pedido.qs) {
    const qs = new URLSearchParams(pedido.qs as Record<string, string>);
    for (const [k, v] of qs) url.searchParams.append(k, v);
  }
  const json = pedido.defaultJson ?? true;
  const headers: Record<string, string> = {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Accept: "application/json, */*;q=0.8",
    ...pedido.headers,
    Authorization: `Bearer ${token}`,
  };
  const init: RequestInit = { method: pedido.method ?? "GET", headers };
  if (pedido.body !== undefined && pedido.body !== null) {
    init.body = json ? JSON.stringify(pedido.body) : (pedido.body as BodyInit);
  }
  return { url: url.toString(), init };
}

/**
 * Cuánto esperar después del 429 número `intento` (0, 1, 2…): `Retry-After` en segundos o como fecha HTTP; si no
 * viene, 1 s, 2 s, 4 s (el mismo respaldo que la auditoría).
 */
export function esperaPorLimite(headers: Headers, intento: number, ahora: number): number {
  const crudo = headers.get("Retry-After")?.trim();
  if (crudo) {
    if (/^\d+(\.\d+)?$/.test(crudo)) return Math.ceil(Number(crudo) * 1000);
    const fecha = Date.parse(crudo);
    if (Number.isFinite(fecha)) return Math.max(0, fecha - ahora);
  }
  return 2 ** intento * 1000;
}

/**
 * Lo que dicen los encabezados del límite sobre el pedido SIGUIENTE: cuánto frenar (0 = nada).
 * - Sin cupo: un segundo (la ventana de HubSpot es móvil: en un segundo se liberan unas once llamadas).
 * - Con menos del 10 % del cupo: espaciar al ritmo que permite el límite (10 s / 110 ≈ 91 ms).
 */
export function frenoPorCupo(headers: Headers): { restante: number | null; frenoMs: number } {
  const restante = Number.parseInt(headers.get("X-HubSpot-RateLimit-Remaining") ?? "", 10);
  if (!Number.isFinite(restante)) return { restante: null, frenoMs: 0 };
  const max = Number.parseInt(headers.get("X-HubSpot-RateLimit-Max") ?? "", 10);
  const ventana = Number.parseInt(headers.get("X-HubSpot-RateLimit-Interval-Milliseconds") ?? "", 10);
  if (restante <= 0) return { restante, frenoMs: 1_000 };
  if (Number.isFinite(max) && max > 0 && Number.isFinite(ventana) && ventana > 0 && restante < max * 0.1) {
    return { restante, frenoMs: Math.ceil(ventana / max) };
  }
  return { restante, frenoMs: 0 };
}

/** Suelta el cuerpo de una respuesta que se descarta (libera la conexión). Nunca lanza. */
function descartar(res: Response): void {
  try {
    void res.body?.cancel().catch(() => {});
  } catch {
    /* ya consumido o sin cuerpo */
  }
}

/**
 * EL pedido a HubSpot. Devuelve la respuesta de HubSpot (la última, si hubo reintentos) y solo lanza si no hubo
 * respuesta (red). Ver la cabecera para qué reintenta y qué no.
 */
export async function pedirAHubspot(
  pedido: PedidoAHubspot,
  credencial: Credencial,
  presupuesto: Presupuesto,
  deps: DependenciasDelTransporte,
): Promise<Response> {
  const freno = deps.freno ?? frenoDelProceso;
  const ev = deps.eventos ?? {};
  let esperado = 0;
  let limites = 0;
  let renovado = false;
  let token = await credencial.token();

  for (;;) {
    // El freno compartido: otro pedido ya chocó con el límite. Se espera con él si cabe; si no, se pide igual (un
    // pedido de ruta no se queda colgado por un job que está esperando).
    const frenoMs = freno.hasta - deps.ahora();
    if (frenoMs > 0 && esperado + frenoMs <= presupuesto.esperaTotalMs) {
      await deps.esperar(frenoMs);
      esperado += frenoMs;
    }

    const { url, init } = armarPedido(pedido, token);
    // Una señal propia en cada intento: dentro de un Server Component, Next memoriza los GET iguales del mismo render
    // y le devolvería al reintento el mismo 429 sin volver a preguntarle a HubSpot. El SDK pedía con node-fetch, que
    // Next no toca; el `fetch` global sí. Con la señal, cada intento es un pedido nuevo.
    init.signal = new AbortController().signal;
    const res = await deps.fetch(url, init);
    ev.pedido?.();

    const cupo = frenoPorCupo(res.headers);
    if (cupo.restante !== null) ev.cupo?.(cupo.restante);
    if (cupo.frenoMs > 0) freno.hasta = Math.max(freno.hasta, deps.ahora() + cupo.frenoMs);

    if (res.status === 401) {
      ev.visto401?.();
      if (renovado || !credencial.renovar) {
        ev.falla401?.();
        return res;
      }
      renovado = true;
      try {
        token = await credencial.renovar(token);
      } catch (e) {
        console.error(`[hubspot/transporte] no se pudo renovar el token: ${e instanceof Error ? e.message : String(e)}`);
        ev.falla401?.();
        return res;
      }
      ev.renovado?.();
      descartar(res);
      continue;
    }

    if (res.status === 429) {
      const espera = esperaPorLimite(res.headers, limites, deps.ahora());
      const cabe =
        limites < presupuesto.reintentos429 &&
        espera <= presupuesto.esperaMaximaMs &&
        esperado + espera <= presupuesto.esperaTotalMs;
      ev.visto429?.(cabe ? espera : 0);
      if (!cabe) {
        ev.falla429?.();
        console.error(
          `[hubspot/transporte] 429 en ${init.method} ${pedido.path ?? ""}: HubSpot pidió esperar ${espera} ms y no cabe (${esperado} ms esperados, ${limites} reintentos)`,
        );
        return res;
      }
      freno.hasta = Math.max(freno.hasta, deps.ahora() + espera);
      descartar(res);
      await deps.esperar(espera);
      esperado += espera;
      limites++;
      continue;
    }

    return res;
  }
}
