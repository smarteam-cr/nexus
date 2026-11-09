/**
 * lib/casos-de-uso/capas.ts — el ORDEN de los casos de uso de la preventa: primero organizar la casa, después lo que se
 * monta encima y al final los agentes y la IA, con los casos conectados uno detrás del otro. PURO y client-safe (lo usan
 * el paso «Casos de uso», el agente que ordena, la propuesta y sus pruebas).
 *
 * Pedido de Marco y Elías (2026-11-09, con Centauro Solutions, un SaaS que todavía no usa HubSpot): el generador puso
 * primero el del guion y el de WhatsApp. Un cliente que no usa HubSpot, o no tiene el hub del área, primero «organiza la
 * casa»: la implementación base de Ventas y de Soporte (arquitectura y proceso); después, los agentes, la IA y los
 * extras. Es lo que dice la escala: primero llegar a Funcional y después automatizar con IA.
 *
 * Cómo se decide, sin IA:
 *   - La CAPA de cada caso: la del catálogo (`CasoDelCatalogo.capa`) o, en uno propio, la que dijo el agente.
 *   - La CASA de cada área en juego está ordenada cuando el área llegó a Funcional en la escala Y usa HubSpot con su hub
 *     (`loQueTieneDeHubspot`, de «Su CRM actualmente»). Si no, sus casos van por capa: casa → proceso → ia → sostener.
 *     Con la casa ordenada manda el orden del agente (solo «sostener» queda al final).
 *   - Las CONEXIONES: un caso que se apoya en otro, o que lo alimenta (WhatsApp alimenta el centro de ayuda), va después
 *     de él. Salen del catálogo (`requiere`, `requiereUnoDe`, `seApoyaEn`, `alimenta`) y de lo que propuso el agente.
 *   - Dentro de eso, el orden que sugirió el agente con todo lo que se sabe (orden.ts), y después el de llegada.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import { casoPorId, CAPAS_DEL_CASO, type AreaDeLaEscala, type CapaDelCaso } from "./catalogo";

export { CAPAS_DEL_CASO, type CapaDelCaso } from "./catalogo";

/** El nombre corto de cada capa (la etiqueta de la fila) y qué es, en una frase. */
export const NOMBRE_DE_LA_CAPA: Record<CapaDelCaso, string> = {
  casa: "Organizar la casa",
  proceso: "Sobre la base",
  ia: "Agentes e IA",
  sostener: "Sostener",
};
export const QUE_ES_LA_CAPA: Record<CapaDelCaso, string> = {
  casa: "La implementación base del área: su arquitectura y su proceso en HubSpot.",
  proceso: "Lo que se monta sobre la base: canales, cotizaciones, reportes e integraciones.",
  ia: "Agentes, IA y automatización avanzada: rinden cuando la base ya funciona.",
  sostener: "Lo que mantiene funcionando lo que ya se implementó.",
};

const RANGO: Record<CapaDelCaso, number> = { casa: 0, proceso: 1, ia: 2, sostener: 3 };

/** Las reglas del orden por capas, como las leen el agente que sugiere y el que ordena. */
export const REGLAS_DE_LA_CASA = `El ORDEN sigue la CASA de cada área: es lo que dice la escala, primero llegar a Funcional y después automatizar con IA. Cada caso tiene una capa:
- «casa»: la implementación base del área, su arquitectura y su proceso (estandarizar el proceso comercial, estructurar el centro de ayuda, migrar a HubSpot, depurar los duplicados).
- «proceso»: lo que se monta sobre la base (cotizaciones, cadencias de seguimiento, WhatsApp, un portal de respuestas, integraciones, reportes).
- «ia»: agentes, IA y automatización avanzada.
- «sostener»: lo que mantiene lo que ya funciona.
Si la empresa todavía no usa HubSpot, no tiene el hub del área o el área está debajo de Funcional, primero se organiza la casa: los casos «casa» de esa área van antes que todo lo demás, después los de «proceso» y al final los de «ia», aunque el cliente hable más de lo último. Con la casa ordenada, manda lo que más le conviene ahora.`;

/** Cómo está la casa, en una o dos frases para el agente: qué tiene de HubSpot y dónde está cada área. */
export function casaParaElAgente(casa: readonly CasaDelArea[], hubspot: SuHubspot, nombreDeNivel: (l: Letra) => string = (l) => l): string {
  const crm = hubspot.usa === false ? "No trabaja en HubSpot." : hubspot.usa === null ? "No se sabe si trabaja en HubSpot." : "Trabaja en HubSpot.";
  const areas = casa.map(
    (c) =>
      `${c.nombre}: ${c.nivel ? nombreDeNivel(c.nivel) : "sin ubicar"}${c.tieneElHub === false && hubspot.usa !== false ? ", sin su hub" : ""}, casa ${c.ordenada ? "ordenada" : "por organizar"}`,
  );
  return `${crm} ${areas.join("; ")}.`;
}

export const esCapa = (x: unknown): x is CapaDelCaso => typeof x === "string" && (CAPAS_DEL_CASO as readonly string[]).includes(x);

/** La capa de un caso de la preventa: la del catálogo si es uno (`cat-…`); si no, la que dijo el agente, o «proceso». */
export function capaDelCaso(useCaseId: string, propia?: CapaDelCaso | null): CapaDelCaso {
  const delCatalogo = useCaseId.startsWith("cat-") ? casoPorId(useCaseId.slice(4)) : undefined;
  return delCatalogo?.capa ?? propia ?? "proceso";
}

// ── Lo que se sabe de su HubSpot ──────────────────────────────────────────────────────────────────

/** Lo que se sabe del HubSpot de la empresa. `usa` null: no se sabe. `hubs` null: usa HubSpot pero no se sabe cuáles. */
export interface SuHubspot {
  usa: boolean | null;
  hubs: AreaDeLaEscala[] | null;
  /** De dónde sale, para el vendedor («Su CRM actualmente no nombra HubSpot»). */
  porQue: string;
}

const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Otro CRM nombrado: si la empresa trabaja en él, no está en HubSpot. */
const OTRO_CRM = /\b(zoho|salesforce|pipedrive|dynamics|odoo|monday|bitrix|freshsales|sugar ?crm|vtiger|kommo|clientify)\b/;
/**
 * Frases que dicen que NO trabaja en HubSpot aunque lo nombren: lo niega («no usa HubSpot», «sin HubSpot»), lo quiere o lo
 * evalúa («quieren migrar a HubSpot», «evaluando HubSpot»), o llegó buscando un CRM. Revisión del 2026-11-09: no cuentan
 * «Migraron de Salesforce a HubSpot» (ya está), «en busca de mejores reportes» ni «pasar a HubSpot Enterprise» (ya tiene
 * otra edición).
 */
const SIN_HUBSPOT =
  /\b(no (usa|usan|tiene|tienen|trabaja|trabajan|cuenta|cuentan)\b[^.]{0,30}hubspot|sin hubspot|todavia no[^.]{0,30}hubspot|(quieren|quiere|planean|piensan|van a|evaluan|evaluando|cotizan|cotizando)\b[^.]{0,25}hubspot(?!\s+(starter|pro|professional|enterprise))|llegaron a hubspot|en busca de un ?crm)/;
const HUB: Record<AreaDeLaEscala, RegExp> = {
  "1": /\bsales hub\b|\bhub de ventas\b/,
  "2": /\bmarketing hub\b|\bhub de marketing\b/,
  "3": /\bservice hub\b|\bhub de servicio\b|\bhelp ?desk de hubspot\b/,
};

/**
 * Lo que se sabe de su HubSpot, de «Su CRM actualmente» (la casilla que dice qué CRM usa y, si es HubSpot, sus hubs) y de
 * lo demás que se sabe («Lo que ya sabemos»). Si la casilla describe su CRM sin nombrar HubSpot, no lo usa; si lo nombra,
 * sí, salvo que diga que no, que lo quiere o lo evalúa (aunque nombre el CRM de antes: «Migraron de Salesforce a
 * HubSpot» lo usa). Sin casilla, cuenta lo mismo en lo demás y, si no nombra HubSpot, otro CRM nombrado.
 */
export function loQueTieneDeHubspot(o: { crmActual?: string | null; otros?: readonly string[] }): SuHubspot {
  const crm = sinTildes(o.crmActual ?? "").trim();
  const otros = sinTildes((o.otros ?? []).join("\n"));
  const hubsDe = (t: string): AreaDeLaEscala[] | null => {
    const hubs = (Object.keys(HUB) as AreaDeLaEscala[]).filter((a) => HUB[a].test(t));
    return hubs.length ? hubs : null;
  };
  if (crm) {
    if (/hubspot/.test(crm) && !SIN_HUBSPOT.test(crm)) {
      const hubs = hubsDe(crm);
      return { usa: true, hubs, porQue: hubs ? "«Su CRM actualmente» dice qué hubs de HubSpot tiene." : "«Su CRM actualmente» dice que usa HubSpot, sin decir qué hubs." };
    }
    const otro = OTRO_CRM.exec(crm) ?? OTRO_CRM.exec(otros);
    return { usa: false, hubs: [], porQue: otro ? `Trabaja en otro CRM (${otro[1]}).` : "«Su CRM actualmente» describe su CRM sin nombrar HubSpot." };
  }
  if (/hubspot/.test(otros) && !SIN_HUBSPOT.test(otros)) return { usa: true, hubs: hubsDe(otros), porQue: "Lo que se sabe dice que usa HubSpot." };
  const otro = OTRO_CRM.exec(otros);
  if (otro) return { usa: false, hubs: [], porQue: `Trabaja en otro CRM (${otro[1]}).` };
  return { usa: null, hubs: null, porQue: "No se sabe qué CRM usa: «Su CRM actualmente» está vacía." };
}

/**
 * Los casos del catálogo que no calzan con su CRM de hoy: «Reactivar el uso del HubSpot que ya pagas» a quien no trabaja
 * en HubSpot (con Centauro, el 9 nov, la escala lo sugería igual) y «Migrar a HubSpot» a quien ya trabaja en él. Sin
 * saber qué CRM usa, ninguno.
 */
export function casosQueNoCalzanConSuCrm(hubspot: SuHubspot): ReadonlySet<string> {
  if (hubspot.usa === false) return new Set(["reactiva-hubspot"]);
  if (hubspot.usa === true) return new Set(["migra-a-hubspot"]);
  return new Set();
}

// ── La casa de cada área ──────────────────────────────────────────────────────────────────────────

/** Cómo está la casa de un área en juego. */
export interface CasaDelArea {
  areaId: string;
  nombre: string;
  /** Su nivel en la escala (null: todavía no se ubica). */
  nivel: Letra | null;
  /** ¿Tiene el hub de esta área? null: no se sabe. */
  tieneElHub: boolean | null;
  /** Llegó a Funcional y trabaja en HubSpot con su hub: sus casos siguen el orden del agente. */
  ordenada: boolean;
}

const LETRAS: readonly Letra[] = ["D", "I", "F", "E", "O"];

/** La casa de cada área en juego, con su nivel en la escala y lo que se sabe de su HubSpot. */
export function laCasa(areas: readonly { id: string; nombre: string; nivel: Letra | null }[], hubspot: SuHubspot): CasaDelArea[] {
  return areas.map((a) => {
    const tieneElHub = hubspot.usa === false ? false : hubspot.usa === null || hubspot.hubs === null ? null : hubspot.hubs.includes(a.id as AreaDeLaEscala);
    const funcional = a.nivel !== null && LETRAS.indexOf(a.nivel) >= LETRAS.indexOf("F");
    return { areaId: a.id, nombre: a.nombre, nivel: a.nivel, tieneElHub, ordenada: funcional && tieneElHub !== false && hubspot.usa !== false };
  });
}

const enLista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/**
 * Por qué la lista va en ese orden, para el vendedor, en una o dos frases. Con alguna casa sin ordenar: qué le falta y que
 * por eso arriba va la base. Con todas ordenadas: que manda lo que más le conviene ahora.
 */
export function explicacionDelOrden(empresa: string, casa: readonly CasaDelArea[], hubspot: SuHubspot, nombreDeNivel: (l: Letra) => string = (l) => l): string {
  if (!casa.length) return "";
  const sinOrdenar = casa.filter((c) => !c.ordenada);
  if (!sinOrdenar.length) {
    return `${enLista(casa.map((c) => c.nombre))} ya ${casa.length === 1 ? "funciona" : "funcionan"} en HubSpot: el orden sigue lo que más le conviene a ${empresa} ahora, y cada caso va después del que lo sostiene.`;
  }
  const motivos: string[] = [];
  if (hubspot.usa === false) motivos.push(`${empresa} todavía no trabaja en HubSpot`);
  else {
    const sinHub = sinOrdenar.filter((c) => c.tieneElHub === false).map((c) => c.nombre);
    if (sinHub.length) motivos.push(`no tiene el hub de ${enLista(sinHub)}`);
  }
  const debajo = sinOrdenar.filter((c) => c.nivel === null || LETRAS.indexOf(c.nivel) < LETRAS.indexOf("F"));
  if (debajo.length) {
    const conNivel = debajo.filter((c) => c.nivel);
    const nivel = conNivel.length && conNivel.every((c) => c.nivel === conNivel[0].nivel) ? ` (en ${nombreDeNivel(conNivel[0].nivel!)})` : "";
    motivos.push(`${enLista(debajo.map((c) => c.nombre))} ${debajo.length === 1 ? "está" : "están"} debajo de ${nombreDeNivel("F")} en la escala${nivel}`);
  }
  const areas = enLista(sinOrdenar.map((c) => c.nombre));
  return `Primero, organizar la casa: ${enLista(motivos)}. Por eso arriba va la implementación base de ${areas}, después lo que se monta encima y al final los agentes y la IA. Cada caso va después del que lo sostiene.`;
}

// ── Las conexiones entre casos ────────────────────────────────────────────────────────────────────

export const TIPOS_DE_CONEXION = ["seApoyaEn", "alimenta"] as const;
export type TipoDeConexion = (typeof TIPOS_DE_CONEXION)[number];

/** Un caso que se apoya en otro o que lo alimenta. `con` es el id del otro en la preventa (`cat-…` o uno propio). */
export interface ConexionDelCaso {
  con: string;
  tipo: TipoDeConexion;
  /** Para el vendedor, en una frase (la escribe el agente; las del catálogo no la traen). */
  porQue?: string;
}

export const MAX_CONEXIONES_POR_CASO = 6;
export const MAX_LARGO_DEL_PORQUE_DE_LA_CONEXION = 200;

/** Cómo se lee cada conexión en la fila: «Se apoya en» / «Alimenta». */
export const VERBO_DE_LA_CONEXION: Record<TipoDeConexion, string> = { seApoyaEn: "Se apoya en", alimenta: "Alimenta" };

/**
 * Las conexiones que trae el catálogo para un caso, hacia los que están en `enLaLista` (ids de la preventa): lo que
 * requiere (todo `requiere`, y de `requiereUnoDe` los que estén), en lo que se apoya y lo que alimenta.
 */
export function conexionesDelCatalogo(useCaseId: string, enLaLista: ReadonlySet<string>, o: { soloRequisitos?: boolean } = {}): ConexionDelCaso[] {
  const caso = useCaseId.startsWith("cat-") ? casoPorId(useCaseId.slice(4)) : undefined;
  if (!caso) return [];
  const fuera: ConexionDelCaso[] = [];
  const sumar = (ids: readonly string[] | undefined, tipo: TipoDeConexion) => {
    for (const id of ids ?? []) if (enLaLista.has(`cat-${id}`) && `cat-${id}` !== useCaseId) fuera.push({ con: `cat-${id}`, tipo });
  };
  sumar(caso.requiere, "seApoyaEn");
  sumar(caso.requiereUnoDe, "seApoyaEn");
  if (o.soloRequisitos) return fuera;
  sumar(caso.seApoyaEn, "seApoyaEn");
  sumar(caso.alimenta, "alimenta");
  return fuera;
}

/**
 * Las conexiones de un caso que valen en esta lista: las suyas (las que propuso el agente) y las del catálogo, sin
 * repetir el mismo otro caso (gana la suya, que trae el porqué), sin apuntarse a sí mismo y solo hacia casos de la lista.
 * Si el agente dijo las suyas, del catálogo quedan solo los requisitos: él leyó a la empresa, y un «alimenta» genérico
 * puede no valer aquí (con Centauro, «WhatsApp de ventas» heredaba «alimenta el centro de ayuda»).
 */
export function conexionesEnLaLista(useCaseId: string, propias: readonly ConexionDelCaso[] | undefined, enLaLista: ReadonlySet<string>): ConexionDelCaso[] {
  const vistos = new Set<string>();
  const fuera: ConexionDelCaso[] = [];
  for (const c of [...(propias ?? []), ...conexionesDelCatalogo(useCaseId, enLaLista, { soloRequisitos: !!propias?.length })]) {
    if (c.con === useCaseId || !enLaLista.has(c.con) || vistos.has(c.con)) continue;
    vistos.add(c.con);
    fuera.push(c);
  }
  return fuera.slice(0, MAX_CONEXIONES_POR_CASO);
}

/**
 * Lo que devolvió el agente para las conexiones de un caso, validado: cada una apunta a otro caso por su id en la
 * preventa o por el título exacto de otro (`resolver` dice a qué id corresponde, o null), con su tipo y una frase.
 */
export function validarConexionesDelAgente(raw: unknown, propio: string, resolver: (ref: string) => string | null): ConexionDelCaso[] {
  const fuera: ConexionDelCaso[] = [];
  const vistos = new Set<string>();
  for (const x of Array.isArray(raw) ? raw : []) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    const tipo = r.tipo;
    if (tipo !== "seApoyaEn" && tipo !== "alimenta") continue;
    const ref = typeof r.con === "string" ? r.con.trim() : "";
    const con = ref ? resolver(ref) : null;
    if (!con || con === propio || vistos.has(con)) continue;
    vistos.add(con);
    const porQue = typeof r.porQue === "string" ? r.porQue.replace(/\s+/g, " ").trim().slice(0, MAX_LARGO_DEL_PORQUE_DE_LA_CONEXION) : "";
    fuera.push({ con, tipo, ...(porQue ? { porQue } : {}) });
  }
  return fuera.slice(0, MAX_CONEXIONES_POR_CASO);
}

// ── El orden de la lista ──────────────────────────────────────────────────────────────────────────

/** Lo que el orden necesita de cada fila. */
export interface FilaParaElPlan {
  id: string;
  capa: CapaDelCaso;
  /** El área del caso (null: sin área, o de varias). */
  areaId: string | null;
  /** Ya resueltas contra la lista (`conexionesEnLaLista`). */
  conexiones: readonly ConexionDelCaso[];
}

/** Por qué una fila quedó donde quedó: lo que se muestra en ella. */
export interface LugarEnLaLista {
  capa: CapaDelCaso;
  /** Va por su capa porque la casa de su área no está ordenada (se muestra la etiqueta de la capa). */
  porLaCasa: boolean;
  /** Los casos de la lista que tienen que ir antes (en los que se apoya o a los que alimenta). */
  despuesDe: string[];
}

/**
 * La lista en su orden: por capa donde la casa no está ordenada, después lo que va antes por sus conexiones, después el
 * orden del agente (`ordenDelAgente`, ids del primero al último) y al final el de llegada. Una fila que se apoya en otra,
 * o que la alimenta, siempre va después de ella; si dos se apuntan entre sí, gana el orden de arriba.
 */
export function planDeLosCasos<T>(
  filas: readonly T[],
  de: (t: T) => FilaParaElPlan,
  o: { casa: readonly CasaDelArea[]; ordenDelAgente?: readonly string[] | null },
): { filas: T[]; lugar: Map<string, LugarEnLaLista> } {
  const ordenada = new Map(o.casa.map((c) => [c.areaId, c.ordenada]));
  const todasOrdenadas = o.casa.every((c) => c.ordenada);
  const enElAgente = new Map((o.ordenDelAgente ?? []).map((id, i) => [id, i]));
  const datos = filas.map((t, i) => {
    const f = de(t);
    const laSuya = f.areaId !== null && ordenada.has(f.areaId) ? ordenada.get(f.areaId)! : todasOrdenadas;
    const porLaCasa = !laSuya && f.capa !== "sostener";
    const grupo = laSuya ? (f.capa === "sostener" ? 3 : 1) : RANGO[f.capa];
    return { t, f, i, grupo, porLaCasa, agente: enElAgente.get(f.id) ?? Number.POSITIVE_INFINITY };
  });
  const ids = new Set(datos.map((d) => d.f.id));
  const antesDe = new Map(datos.map((d) => [d.f.id, d.f.conexiones.map((c) => c.con).filter((c) => ids.has(c) && c !== d.f.id)]));
  const prioridad = (a: (typeof datos)[number], b: (typeof datos)[number]) => a.grupo - b.grupo || a.agente - b.agente || a.i - b.i;
  const quedan = [...datos].sort(prioridad);
  const puestos = new Set<string>();
  const fuera: typeof datos = [];
  while (quedan.length) {
    // La primera, por prioridad, que ya tiene puestas las que van antes; si ninguna (se apuntan entre sí), la primera.
    let k = quedan.findIndex((d) => (antesDe.get(d.f.id) ?? []).every((c) => puestos.has(c)));
    if (k < 0) k = 0;
    const [d] = quedan.splice(k, 1);
    puestos.add(d.f.id);
    fuera.push(d);
  }
  return {
    filas: fuera.map((d) => d.t),
    lugar: new Map(fuera.map((d) => [d.f.id, { capa: d.f.capa, porLaCasa: d.porLaCasa, despuesDe: antesDe.get(d.f.id) ?? [] }])),
  };
}
