/**
 * lib/hubspot/encargados.ts — quién lleva un proyecto en HubSpot, y los dos encargados de una cuenta como propiedades.
 * PURO.
 *
 * ── QUIÉN LLEVA UN PROYECTO (2026-10-29) ─────────────────────────────────────────────────────────
 * Manda el «Propietario» del proyecto (`hubspot_owner_id`), por decisión de Elías del 29 oct: «que Nexus lea el campo
 * propietario de los proyectos de HubSpot como el Customer Success encargado». Si está vacío, «CSE Encargado»
 * (`cse_encargado`) y, si también, «CSL Encargado» (`csl_encargado`): lo que mandaba del 2026-10-09 al 29 oct, y lo
 * único que tienen algunos proyectos de Desarrollo y Sitios web. Medido el 29 oct (`scripts/propietario-como-encargado.ts`):
 * de 98 proyectos activos, 23 tenían un propietario distinto de «CSE Encargado» y 5 no tenían, pero en Nexus cambian
 * solo 4 (en el resto uno de los dos está archivado en HubSpot) y una sola cuenta, BLUESAT.
 *
 * ── LOS DOS ENCARGADOS DE LA CUENTA (2026-10-09) ─────────────────────────────────────────────────
 * «CSE Encargado» es el CSE de la cuenta; «CSL Encargado», la CSL. El pase de cuenta los sigue escribiendo en los
 * proyectos, la empresa y sus contactos (lib/hubspot/encargados-de-la-cuenta.ts), y en los proyectos escribe además el
 * propietario (`propiedadesDelPaseEnElProyecto`): sin eso, el pase no cambiaría a nadie.
 * ⛔ El propietario se escribe SOLO en los proyectos: el de la EMPRESA es el vendedor (lib/hubspot/vendedor-de-la-empresa.ts).
 */
export const PROP_PROPIETARIO = "hubspot_owner_id";
export const PROP_CSE_ENCARGADO = "cse_encargado";
export const PROP_CSL_ENCARGADO = "csl_encargado";

export interface Encargados {
  /** Owner id del CSE. */
  cse: string;
  /** Owner id de la CSL; null = no se escribe (no hay CSL con usuario en HubSpot). */
  csl: string | null;
}

/** «CSE Encargado» y «CSL Encargado», para los proyectos, la empresa y sus contactos. */
export function propiedadesDeEncargados(e: Encargados): Record<string, string> {
  return { [PROP_CSE_ENCARGADO]: e.cse, ...(e.csl ? { [PROP_CSL_ENCARGADO]: e.csl } : {}) };
}

/** Lo que el pase escribe en un PROYECTO: el propietario (lo que lee el espejo) y los dos encargados. */
export function propiedadesDelPaseEnElProyecto(e: Encargados): Record<string, string> {
  return { [PROP_PROPIETARIO]: e.cse, ...propiedadesDeEncargados(e) };
}

export interface PropiedadesDelEncargado {
  hubspot_owner_id?: string | null;
  cse_encargado?: string | null;
  csl_encargado?: string | null;
}

const valor = (v: string | null | undefined) => (v ?? "").trim() || null;

/** El owner que lleva el proyecto: el propietario; vacío, «CSE Encargado»; vacío, «CSL Encargado». */
export function encargadoDelProyecto(props: PropiedadesDelEncargado): string | null {
  return valor(props.hubspot_owner_id) ?? valor(props.cse_encargado) ?? valor(props.csl_encargado);
}

/**
 * El owner que lleva el proyecto (`principal`) y a quién se recurre si HubSpot no devuelve su correo (`respaldo`: un
 * propietario archivado en HubSpot). El respaldo es «CSE Encargado» o «CSL Encargado», si es otra persona.
 */
export function duenoDelProyecto(props: PropiedadesDelEncargado): { principal: string | null; respaldo: string | null } {
  const principal = encargadoDelProyecto(props);
  const respaldo = encargadoDelProyecto({ cse_encargado: props.cse_encargado, csl_encargado: props.csl_encargado });
  return { principal, respaldo: respaldo && respaldo !== principal ? respaldo : null };
}

/** Lo que HubSpot contestó de un owner: su nombre y correo, o que no contestó (un 429, un 5xx, la red). */
export interface OwnerLeido {
  name: string | null;
  email: string | null;
  /** HubSpot no contestó: no se sabe si existe. Distinto de un owner archivado, que contesta sin correo (404). */
  sinRespuesta?: boolean;
}

/**
 * Qué owner se guarda en el proyecto, id, nombre y correo siempre del MISMO owner. `null` = no se sabe y NO SE TOCA lo
 * que ya estaba: lo que decide quién ve la cuenta no se escribe con una duda.
 *   · el principal, si HubSpot da su correo;
 *   · si está archivado (contestó sin correo), el respaldo: así, con el propietario archivado, cambiar «CSE Encargado»
 *     cambia el id y el pase de cuenta lo ve (lib/cuentas/pase.ts exige otro id);
 *   · sin respaldo vivo, el principal sin correo: el proyecto se queda sin encargado, y eso es lo cierto;
 *   · si el que hacía falta NO contestó (429, 5xx, la red), null. Con el correo vacío, el CSE perdía el acceso y lo
 *     abierto podía pasar a otro; con el id nuevo y el correo viejo, la copia siguiente veía «mismo id» y el pase de un
 *     cambio real no se hacía nunca (segunda revisión del 2026-10-29).
 */
export function ownerQueSeGuarda(
  dueno: { principal: string | null; respaldo: string | null },
  principal: OwnerLeido,
  respaldo: OwnerLeido,
): { id: string | null; name: string | null; email: string | null } | null {
  if (principal.email) return { id: dueno.principal, name: principal.name, email: principal.email };
  if (principal.sinRespuesta) return null;
  if (!dueno.respaldo) return { id: dueno.principal, name: principal.name, email: null };
  if (respaldo.email) return { id: dueno.respaldo, name: respaldo.name, email: respaldo.email };
  if (respaldo.sinRespuesta) return null;
  return { id: dueno.principal, name: principal.name, email: null };
}

/** Un valor de la historia de una propiedad en HubSpot (`propertiesWithHistory`). */
export interface ValorEnElTiempo {
  value: string | null;
  timestamp: string;
}

/**
 * El encargado que tenía el proyecto en una fecha, con la misma regla que `encargadoDelProyecto`, sobre la historia de
 * las tres propiedades. Sirve para medir quién llevaba la cuenta hace N días (scripts/pase-de-cuenta.ts). Sin historia
 * hasta esa fecha: null.
 */
export function encargadoEnLaFecha(
  historia: { propietario?: readonly ValorEnElTiempo[]; cse?: readonly ValorEnElTiempo[]; csl?: readonly ValorEnElTiempo[] },
  fecha: Date,
): string | null {
  const valorA = (vs: readonly ValorEnElTiempo[] | undefined) => {
    const previos = (vs ?? []).filter((v) => Date.parse(v.timestamp) <= fecha.getTime()).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return previos[0]?.value ?? null;
  };
  return encargadoDelProyecto({ hubspot_owner_id: valorA(historia.propietario), cse_encargado: valorA(historia.cse), csl_encargado: valorA(historia.csl) });
}
