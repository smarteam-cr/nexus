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
 * solo 2, los dos de Desarrollo (en el resto uno de los dos está archivado en HubSpot, o es lo de abajo), y ninguna cuenta.
 *
 * ── EL PROPIETARIO SEGÚN EL PIPELINE (2026-10-30) ────────────────────────────────────────────────
 * Elías, 30 oct: los proyectos del pipeline de Development son del equipo técnico; los de Implementación de HubSpot y
 * SmartLoop, de Customer Success. Por eso, en un proyecto de CS (`esPipelineIdDeCs`) un propietario del equipo técnico
 * (`esDelEquipoTecnico`: el rol DEV de `TeamMember`, no una lista de nombres) no cuenta como encargado: se usa «CSE
 * Encargado» o, si está vacío, «CSL Encargado». Si no hay nadie más, queda ese propietario (Nexus no inventa a
 * alguien). En Desarrollo y Sitios web manda el propietario, sea quien sea. Ver `ownerQueSeGuarda`.
 *
 * ── «CSE ENCARGADO» ESTÁ DE SALIDA (2026-10-30) ──────────────────────────────────────────────────
 * Elías, 30 oct: esa propiedad se migra al propietario y después se borra de HubSpot. El respaldo es de transición, y un
 * propietario técnico en un proyecto de CS es un dato por corregir allá, no algo que Nexus tape para siempre: la lista
 * sale de scripts/propietarios-por-migrar.ts (`propietarioPorMigrar`).
 *   · El día que HubSpot la borre, Nexus sigue andando sin tocar nada: la lectura la recibe vacía y una escritura que
 *     HubSpot rechaza por eso se repite sin ella (`escribirSinLaRetirada`). Lo que siga en la lista cae a «CSL Encargado»,
 *     que es la CSL: por eso se migra ANTES de borrarla.
 *   · Lo que Nexus lee y escribe cambia en UNA línea, `SE_USA_CSE_ENCARGADO`; `PROJECT_PROPERTIES` la sigue pidiendo, y
 *     pedirla no cuesta. En esa tanda se ajustan las pruebas que la nombran, el aviso de la columna en Clientes y
 *     DECISIONS. La limpieza de después: borrar esa constante y `PROP_CSE_ENCARGADO` (tsc marca el resto),
 *     `escribirSinLaRetirada` y, con la lista vacía, la regla del técnico.
 *
 * ── LOS DOS ENCARGADOS DE LA CUENTA (2026-10-09) ─────────────────────────────────────────────────
 * «CSE Encargado» es el CSE de la cuenta; «CSL Encargado», la CSL. El pase de cuenta los sigue escribiendo en los
 * proyectos, la empresa y sus contactos (lib/hubspot/encargados-de-la-cuenta.ts), y en los proyectos escribe además el
 * propietario (`propiedadesDelPaseEnElProyecto`): sin eso, el pase no cambiaría a nadie. El pase toca solo proyectos de
 * CS, así que nunca se elige a alguien del equipo técnico (lo frena la ruta, app/api/clients/[id]/cse-encargado).
 * ⛔ El propietario se escribe SOLO en los proyectos: el de la EMPRESA es el vendedor (lib/hubspot/vendedor-de-la-empresa.ts).
 */
export const PROP_PROPIETARIO = "hubspot_owner_id";
export const PROP_CSE_ENCARGADO = "cse_encargado";
export const PROP_CSL_ENCARGADO = "csl_encargado";

/** ⏳ false = Nexus deja de leer y de escribir «CSE Encargado». El ÚNICO lugar para retirarla (ver arriba). */
export const SE_USA_CSE_ENCARGADO: boolean = true;

export interface Encargados {
  /** Owner id del CSE. */
  cse: string;
  /** Owner id de la CSL; null = no se escribe (no hay CSL con usuario en HubSpot). */
  csl: string | null;
}

/** ¿Este rol de `TeamMember` es del equipo técnico? Son los dueños de los proyectos de Desarrollo, no de los de CS. */
export const esDelEquipoTecnico = (rol: string | null | undefined): boolean => rol === "DEV";

/** «CSE Encargado» y «CSL Encargado», para los proyectos, la empresa y sus contactos. */
export function propiedadesDeEncargados(e: Encargados, usaCse = SE_USA_CSE_ENCARGADO): Record<string, string> {
  return { ...(usaCse ? { [PROP_CSE_ENCARGADO]: e.cse } : {}), ...(e.csl ? { [PROP_CSL_ENCARGADO]: e.csl } : {}) };
}

/** Lo que el pase escribe en un PROYECTO: el propietario (lo que lee el espejo) y los dos encargados. */
export function propiedadesDelPaseEnElProyecto(e: Encargados, usaCse = SE_USA_CSE_ENCARGADO): Record<string, string> {
  return { [PROP_PROPIETARIO]: e.cse, ...propiedadesDeEncargados(e, usaCse) };
}

/** ¿HubSpot rechazó la escritura porque «CSE Encargado» ya no existe? Cualquier otro rechazo sigue siendo un error. */
export function rechazoPorLaRetirada(status: number, cuerpo: string): boolean {
  return status === 400 && cuerpo.includes(PROP_CSE_ENCARGADO) && /PROPERTY_DOESNT_EXIST|does not exist/i.test(cuerpo);
}

/** Lo que hace falta de una respuesta de HubSpot (la del SDK o la de `fetch`). */
export interface RespuestaDeHubspot {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
  clone(): Pick<RespuestaDeHubspot, "text">;
}

/**
 * Escribe y, si HubSpot rechaza «CSE Encargado» porque ya no existe, repite sin ella: esa propiedad no puede tumbar un
 * pase de cuenta. Sin nada que escribir, no llama. Devuelve la respuesta que vale, sin leerle el cuerpo a quien llama.
 */
export async function escribirSinLaRetirada(
  properties: Record<string, string>,
  enviar: (properties: Record<string, string>) => Promise<RespuestaDeHubspot>,
): Promise<RespuestaDeHubspot> {
  if (Object.keys(properties).length === 0) return new Response(null, { status: 204 });
  const res = await enviar(properties);
  if (res.ok || !(PROP_CSE_ENCARGADO in properties)) return res;
  const cuerpo = await res.clone().text().catch(() => "");
  if (!rechazoPorLaRetirada(res.status, cuerpo)) return res;
  const resto = Object.fromEntries(Object.entries(properties).filter(([k]) => k !== PROP_CSE_ENCARGADO));
  return Object.keys(resto).length === 0 ? new Response(null, { status: 204 }) : enviar(resto);
}

export interface PropiedadesDelEncargado {
  hubspot_owner_id?: string | null;
  cse_encargado?: string | null;
  csl_encargado?: string | null;
}

const valor = (v: string | null | undefined) => (v ?? "").trim() || null;

/**
 * Los owners que pueden llevar el proyecto, en orden y sin repetir: el propietario y su respaldo, «CSE Encargado» o, solo
 * si está vacío, «CSL Encargado». Con «CSE Encargado» archivado la CSL no entra: esa cuenta no tiene CSE, y la CSL no
 * pasa a llevarla por eso (cinco cuentas pasarían a su nombre, medido el 30 oct). Por lo mismo, un proyecto de CS con
 * propietario técnico y «CSE Encargado» archivado o técnico se queda con el técnico y sale en la lista para migrar.
 */
export function candidatosDelProyecto(props: PropiedadesDelEncargado, usaCse = SE_USA_CSE_ENCARGADO): string[] {
  const respaldo = (usaCse ? valor(props.cse_encargado) : null) ?? valor(props.csl_encargado);
  return [...new Set([valor(props.hubspot_owner_id), respaldo].filter((id): id is string => !!id))];
}

/** El owner que lleva el proyecto, sin mirar quién es: el primero de `candidatosDelProyecto`. */
export function encargadoDelProyecto(props: PropiedadesDelEncargado): string | null {
  return candidatosDelProyecto(props)[0] ?? null;
}

/** Lo que HubSpot contestó de un owner: su nombre y correo, o que no contestó (un 429, un 5xx, la red). */
export interface OwnerLeido {
  name: string | null;
  email: string | null;
  /** HubSpot no contestó: no se sabe si existe. Distinto de un owner archivado, que contesta sin correo (404). */
  sinRespuesta?: boolean;
}

/** Un candidato, con lo que HubSpot contestó de él. */
export type OwnerCandidato = OwnerLeido & { id: string };

/** Lo que el proyecto y el equipo le dicen a `ownerQueSeGuarda`. */
export interface ReglasDelProyecto {
  /** Del pipeline de Customer Success (`esPipelineIdDeCs`). */
  deCs: boolean;
  /** Los correos del equipo técnico, en minúsculas. */
  tecnicos: ReadonlySet<string>;
}

/**
 * Qué owner se guarda en el proyecto, id, nombre y correo siempre del MISMO owner. `null` = no se sabe y NO SE TOCA lo
 * que ya estaba: lo que decide quién ve la cuenta no se escribe con una duda.
 *   · el primer candidato con correo que cuente para este proyecto (`reglas`: alguien técnico no cuenta en uno de CS).
 *     Así, con el propietario archivado, cambiar «CSE Encargado» cambia el id y el pase de cuenta lo ve (lib/cuentas/pase.ts
 *     exige otro id);
 *   · si no hay ninguno, el primero con correo: un técnico en un proyecto de CS se queda, porque no hay nadie más escrito;
 *   · sin ningún correo, el primero tal como vino: el proyecto se queda sin encargado, y eso es lo cierto;
 *   · si uno que hacía falta NO contestó (429, 5xx, la red), null. Con el correo vacío, el CSE perdía el acceso y lo
 *     abierto podía pasar a otro; con el id nuevo y el correo viejo, la copia siguiente veía «mismo id» y el pase de un
 *     cambio real no se hacía nunca (segunda revisión del 2026-10-29).
 */
export function ownerQueSeGuarda(
  candidatos: readonly OwnerCandidato[],
  reglas: ReglasDelProyecto,
): { id: string | null; name: string | null; email: string | null } | null {
  const fila = (c: OwnerCandidato | undefined) => ({ id: c?.id ?? null, name: c?.name ?? null, email: c?.email ?? null });
  const noCuenta = (c: OwnerCandidato) => reglas.deCs && reglas.tecnicos.has((c.email ?? "").trim().toLowerCase());
  for (const c of candidatos) {
    if (c.sinRespuesta) return null;
    if (c.email && !noCuenta(c)) return fila(c);
  }
  return fila(candidatos.find((c) => c.email) ?? candidatos[0]);
}

/** Por qué el propietario de un proyecto de CS está por corregir en HubSpot. */
export type PorQueMigrar = "falta" | "archivado" | "tecnico";

/**
 * ¿Hay que corregir el propietario de este proyecto de CS antes de borrar «CSE Encargado»? null = está bien. Falta, está
 * archivado en HubSpot o es del equipo técnico. `deberiaQuedar`: «CSE Encargado», si es alguien vivo que no es técnico;
 * si no, null y lo decide una persona. `correoDe`: el correo de un owner vivo, en minúsculas.
 */
export function propietarioPorMigrar(
  props: PropiedadesDelEncargado,
  correoDe: (ownerId: string) => string | null,
  tecnicos: ReadonlySet<string>,
): { porQue: PorQueMigrar; deberiaQuedar: string | null } | null {
  const propietario = valor(props.hubspot_owner_id);
  const correo = propietario ? correoDe(propietario) : null;
  const porQue: PorQueMigrar | null = !propietario ? "falta" : !correo ? "archivado" : tecnicos.has(correo) ? "tecnico" : null;
  if (!porQue) return null;
  const cse = valor(props.cse_encargado);
  const correoDelCse = cse ? correoDe(cse) : null;
  return { porQue, deberiaQuedar: cse && correoDelCse && !tecnicos.has(correoDelCse) ? cse : null };
}

/** Un valor de la historia de una propiedad en HubSpot (`propertiesWithHistory`). */
export interface ValorEnElTiempo {
  value: string | null;
  timestamp: string;
}

/**
 * El encargado que tenía el proyecto en una fecha, con la misma regla que `encargadoDelProyecto`, sobre la historia de
 * las tres propiedades. Sirve para medir quién llevaba la cuenta hace N días (scripts/pase-de-cuenta.ts). Sin historia
 * hasta esa fecha: null. `noCuenta`: el owner que cede si hay alguien más (archivado o técnico en un proyecto de CS).
 */
export function encargadoEnLaFecha(
  historia: { propietario?: readonly ValorEnElTiempo[]; cse?: readonly ValorEnElTiempo[]; csl?: readonly ValorEnElTiempo[] },
  fecha: Date,
  noCuenta: (ownerId: string) => boolean = () => false,
): string | null {
  const valorA = (vs: readonly ValorEnElTiempo[] | undefined) => {
    const previos = (vs ?? []).filter((v) => Date.parse(v.timestamp) <= fecha.getTime()).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return previos[0]?.value ?? null;
  };
  const candidatos = candidatosDelProyecto({ hubspot_owner_id: valorA(historia.propietario), cse_encargado: valorA(historia.cse), csl_encargado: valorA(historia.csl) });
  return candidatos.find((id) => !noCuenta(id)) ?? candidatos[0] ?? null;
}
