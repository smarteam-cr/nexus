/**
 * lib/auditoria-portal/lecturas.ts — UN CERO NO ES LO MISMO QUE «NO PUDE LEER».
 *
 * Hasta el 2026-10-03 la auditoría contaba con `crmSearch`, que ante CUALQUIER respuesta que no
 * fuera 200 —un 403 por falta de permiso, un 401 por una conexión vencida, los 429 agotados, un
 * 500— devolvía `{ total: 0 }`. Para la pantalla y para la IA eso era «hay 0 tickets», «0 contactos
 * sin propietario», y las recomendaciones salían de ese cero. En el portal de Smarteam casi no se
 * notaba porque la conexión tiene todos los permisos; en el portal de un cliente es el error más
 * caro: el cliente lee «no usas tickets» cuando lo único que pasó es que no teníamos permiso.
 *
 * Este módulo es el ÚNICO camino de la auditoría hacia HubSpot. Cada lectura devuelve el dato o
 * `null`, y si devuelve `null` deja anotado QUÉ no se pudo leer y POR QUÉ. Quien muestra o analiza
 * los números decide con esa lista; nadie vuelve a ver un cero que no salió de HubSpot.
 * Lo vigila `lecturas.test.ts`: `portal-analyzer.ts` no puede llamar a `fetch` por su cuenta.
 *
 * ⚠ No importa nada de Nexus (ni base, ni permisos, ni clientes) y el `fetch` se inyecta: es la
 * primera pieza del motor de auditoría separado (plan de auditoría de portales, punto 2).
 */

/** Por qué no se pudo leer algo. Cada motivo pide una acción distinta al ejecutivo. */
export type MotivoDeFalla =
  /** 403: la conexión no tiene el permiso (scope) para leer esto. */
  | "sin_permiso"
  /** 401: la conexión venció, se revocó o la llave es inválida. */
  | "credencial"
  /** 429 aun después de esperar y reintentar. */
  | "limite"
  /** Cualquier otra respuesta de HubSpot que no fue 200. */
  | "error_hubspot"
  /** No hubo respuesta: red, DNS, timeout. */
  | "red";

/**
 * A qué parte de la auditoría pertenece una lectura. Es lo que permite decidir, sección por
 * sección, si los números se pueden mostrar: un gráfico de etapas con UNA etapa sin leer no es un
 * gráfico incompleto, es un gráfico falso (la etapa que falta se suma a «sin etapa»).
 */
export type BloqueDeLectura =
  | "cuenta"
  | "totales"
  | "etapas_del_portal"
  | "contactos_por_etapa"
  | "empresas_por_etapa"
  | "workflows"
  | "propietarios"
  | "actividad_de_pipelines"
  | "detalle_de_contactos"
  | "detalle_de_empresas"
  | "propiedades"
  | "pipelines"
  | "usuarios"
  | "objetos";

export interface LecturaFallida {
  bloque: BloqueDeLectura;
  /** Qué se intentaba leer, en palabras: «Total de tickets», «Contactos en la etapa «Lead»». */
  que: string;
  motivo: MotivoDeFalla;
  /** El código HTTP, si HubSpot respondió algo. */
  status?: number;
}

/** Lo que una corrida dejó anotado. Se guarda tal cual dentro de la auditoría. */
export interface RegistroDeLecturas {
  /** Lecturas lógicas intentadas (no cuenta los reintentos de una misma lectura). */
  intentos: number;
  fallidas: LecturaFallida[];
}

/** Versión del formato del registro dentro de la foto guardada. */
export const VERSION_DEL_REGISTRO = 1;

export function nuevoRegistro(): RegistroDeLecturas {
  return { intentos: 0, fallidas: [] };
}

export function motivoDeStatus(status: number): MotivoDeFalla {
  if (status === 401) return "credencial";
  if (status === 403) return "sin_permiso";
  if (status === 429) return "limite";
  return "error_hubspot";
}

export type ResultadoDeLectura<T> =
  | { ok: true; valor: T }
  | { ok: false; motivo: MotivoDeFalla; status?: number };

export interface DependenciasDeRed {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  esperar: (ms: number) => Promise<void>;
}

const depsReales: DependenciasDeRed = {
  fetch: (url, init) => fetch(url, init),
  esperar: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
};

/** Cuántas veces se vuelve a pedir tras un 429 antes de darse por vencido. */
export const REINTENTOS_POR_LIMITE = 3;
/** Cuántas veces se vuelve a pedir tras un error de red. */
export const REINTENTOS_POR_RED = 2;

/**
 * Una petición a HubSpot con la política de reintentos de la auditoría: un 429 se espera
 * (`Retry-After` si viene, si no 1 s, 2 s, 4 s) y se reintenta; un error de red se reintenta tras
 * medio segundo; cualquier otra respuesta que no sea 200 es definitiva y se informa con su motivo.
 * Nunca lanza: devuelve el resultado.
 */
export async function pedir<T>(
  url: string,
  init: RequestInit,
  deps: DependenciasDeRed = depsReales,
): Promise<ResultadoDeLectura<T>> {
  let fallasDeRed = 0;
  let limites = 0;
  for (;;) {
    let res: Response;
    try {
      res = await deps.fetch(url, init);
    } catch {
      if (fallasDeRed >= REINTENTOS_POR_RED) return { ok: false, motivo: "red" };
      fallasDeRed++;
      await deps.esperar(500);
      continue;
    }

    if (res.status === 429) {
      if (limites >= REINTENTOS_POR_LIMITE) return { ok: false, motivo: "limite", status: 429 };
      const segundos = Number.parseInt(res.headers.get("Retry-After") ?? "", 10);
      await deps.esperar(Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : 2 ** limites * 1000);
      limites++;
      continue;
    }

    if (!res.ok) return { ok: false, motivo: motivoDeStatus(res.status), status: res.status };

    try {
      return { ok: true, valor: (await res.json()) as T };
    } catch {
      // Un 200 con un cuerpo que no es JSON no es un dato: no se inventa uno.
      return { ok: false, motivo: "error_hubspot", status: res.status };
    }
  }
}

interface RespuestaDeBusqueda {
  total: number;
  results: { properties: Record<string, string> }[];
}

export interface Busqueda {
  objeto: string;
  filterGroups: object[];
  properties?: string[];
  limit?: number;
  sorts?: object[];
}

/**
 * El lector de UNA corrida: sabe el token y anota en el registro. Todo lo que la auditoría lee de
 * HubSpot pasa por acá.
 */
export interface LectorDeHubspot {
  /** Cuántos registros cumplen la búsqueda, o `null` si no se pudo saber. */
  contar(bloque: BloqueDeLectura, que: string, busqueda: Busqueda): Promise<number | null>;
  /** La búsqueda completa (total + resultados), o `null`. */
  buscar(bloque: BloqueDeLectura, que: string, busqueda: Busqueda): Promise<RespuestaDeBusqueda | null>;
  /** Un GET a la API, o `null`. `conToken: false` para los endpoints que llevan el token en la URL. */
  leer<T>(bloque: BloqueDeLectura, que: string, ruta: string, opciones?: { conToken?: boolean }): Promise<T | null>;
  /** Un POST de LECTURA (las lecturas por lote de HubSpot van por POST), o `null`. Nunca escribe. */
  leerPorLote<T>(bloque: BloqueDeLectura, que: string, ruta: string, cuerpo: unknown): Promise<T | null>;
  readonly registro: RegistroDeLecturas;
}

const BASE = "https://api.hubapi.com";

export function crearLector(
  token: string,
  registro: RegistroDeLecturas = nuevoRegistro(),
  deps: DependenciasDeRed = depsReales,
): LectorDeHubspot {
  const anotar = (bloque: BloqueDeLectura, que: string, r: { motivo: MotivoDeFalla; status?: number }) => {
    registro.fallidas.push({ bloque, que, motivo: r.motivo, ...(r.status ? { status: r.status } : {}) });
  };

  const buscar = async (bloque: BloqueDeLectura, que: string, b: Busqueda) => {
    registro.intentos++;
    const r = await pedir<RespuestaDeBusqueda>(
      `${BASE}/crm/v3/objects/${b.objeto}/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          filterGroups: b.filterGroups,
          properties: b.properties ?? [],
          sorts: b.sorts ?? [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
          limit: b.limit ?? 1,
        }),
      },
      deps,
    );
    if (!r.ok) {
      anotar(bloque, que, r);
      return null;
    }
    // Un 200 sin `total` numérico tampoco es un cero.
    if (typeof r.valor?.total !== "number") {
      anotar(bloque, que, { motivo: "error_hubspot", status: 200 });
      return null;
    }
    return { total: r.valor.total, results: r.valor.results ?? [] };
  };

  return {
    registro,
    buscar,
    async contar(bloque, que, b) {
      const r = await buscar(bloque, que, b);
      return r ? r.total : null;
    },
    async leer<T>(bloque: BloqueDeLectura, que: string, ruta: string, opciones?: { conToken?: boolean }) {
      registro.intentos++;
      const conToken = opciones?.conToken ?? true;
      const r = await pedir<T>(
        `${BASE}${ruta}`,
        conToken ? { headers: { Authorization: `Bearer ${token}` } } : {},
        deps,
      );
      if (!r.ok) {
        anotar(bloque, que, r);
        return null;
      }
      return r.valor;
    },
    async leerPorLote<T>(bloque: BloqueDeLectura, que: string, ruta: string, cuerpo: unknown) {
      // ⚠ Solo para endpoints de LECTURA por lote (`…/batch/read`): la auditoría no escribe en el
      // portal. Lo vigila lecturas.test.ts.
      if (!/\/batch\/read$/.test(ruta)) throw new Error(`leerPorLote solo acepta rutas …/batch/read (pidió ${ruta})`);
      registro.intentos++;
      const r = await pedir<T>(
        `${BASE}${ruta}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(cuerpo),
        },
        deps,
      );
      if (!r.ok) {
        anotar(bloque, que, r);
        return null;
      }
      return r.valor;
    },
  };
}
