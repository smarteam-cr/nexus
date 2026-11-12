/**
 * lib/planificacion/secciones.ts — la forma de las secciones de la Planificación práctica (2026-10-02)
 * y cómo se leen las versiones viejas.
 *
 * La Planificación pasó a ser lo que va a quedar configurado en HubSpot: procesos (solo lo que se
 * hará; cómo operan hoy vive en el Diagnóstico), etapas del ciclo de vida, propiedades por objeto,
 * pipelines de leads/ventas/servicio, automatizaciones y conversaciones.
 *
 * Varias secciones ya tenían contenido con otra forma —la prosa del ciclo de vida, el «hoy / cómo
 * será» de los procesos, y lo que se mudó desde Ejecución (pipelines como texto, procesos de
 * marketing como prosa)—. Cada `adoptar*` lleva lo viejo a la forma nueva SIN escribir: lo usan el
 * renderer (para pintar y, al primer cambio de una persona, guardar ya la forma nueva) y la migración.
 *
 * Puro: sin React ni Prisma.
 */

import { normalizarOrigen } from "./origen";

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/* ── Procesos: cómo van a funcionar ─────────────────────────────────────────── */

export interface PasoDeProceso {
  paso: string;
  detalle?: string;
  origen?: string;
}
export interface ProcesoFuturo {
  nombre: string;
  /** Titular de media línea: cómo va a funcionar. */
  resumen?: string;
  /** Las reuniones que lo respaldan. */
  fuente?: string;
  pasos: PasoDeProceso[];
  /** Legacy: el párrafo «cómo será» de antes. Se muestra mientras no haya pasos. */
  comoSera?: string;
}
export interface ProcesosFuturoData {
  intro?: string;
  procesos: ProcesoFuturo[];
}

/** El «hoy / cómo será» viejo → solo lo que se hará. Los campos de «hoy» quedan guardados, sin mostrarse. */
export function adoptarProcesos(data: unknown): ProcesosFuturoData {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    intro: txt(d.intro),
    procesos: arr<Record<string, unknown>>(d.procesos).map((p) => ({
      ...p,
      nombre: txt(p.nombre),
      resumen: txt(p.resumen) || txt(p.resumenSera),
      fuente: txt(p.fuente),
      pasos: arr<PasoDeProceso>(p.pasos),
      ...(txt(p.comoSera) ? { comoSera: txt(p.comoSera) } : {}),
    })),
  };
}

/* ── Etapas del ciclo de vida ───────────────────────────────────────────────── */

export const CAMBIOS_DE_ETAPA = [
  { value: "nueva", label: "Nueva" },
  { value: "se_mantiene", label: "Se mantiene" },
  { value: "renombrada", label: "Se renombra" },
  { value: "se_quita", label: "Se quita" },
] as const;

export interface EtapaDeCiclo {
  etapa: string;
  entraCuando: string;
  laMueve?: string;
  cambio?: string;
  origen?: string;
  /**
   * 'no' = esta etapa de HubSpot no se usa en el modelo de venta del cliente (Elías y Lili, 12 nov: CEMACO es retail, sus
   * asesores no trabajan en el CRM y no hay negocios: MQL, SQL y Oportunidad no aplican). Su `entraCuando` dice por qué.
   * Vacío o 'si' = se usa (todo documento de antes).
   */
  seUsa?: string;
}
/** El estado del lead (Nuevo, En contacto…): en el Brief va al lado del ciclo de vida. Lo escribe una persona. */
export interface EstadoDelLead {
  estado: string;
  significa?: string;
  origen?: string;
}
export interface CicloDeVidaData {
  intro?: string;
  etapas: EtapaDeCiclo[];
  /** Fuera del esquema del agente (2026-10-25): `preserveNonSchemaKeys` lo conserva al regenerar. */
  estadosLead?: EstadoDelLead[];
}

/** Los cuatro estados del lead que trae el Brief, para empezar sin escribirlos. */
export const ESTADOS_DEL_LEAD_DE_SIEMPRE = ["Nuevo", "En contacto", "Descartado", "Re ingreso"] as const;

/**
 * LAS 7 ETAPAS DE HUBSPOT (Elías, 12 nov 2026, al revisar la planificación de marketing de Cemaco): el ciclo de vida de
 * la Planificación son SIEMPRE las etapas por defecto de HubSpot, en este orden. El agente nunca crea, renombra ni quita
 * etapas: lo propio del cliente («contacto base», «depurado», «cliente activo») es la condición para entrar a una de
 * estas, o un estado del lead. Antes el formato permitía etapas nuevas y salieron inventadas («Contacto base»,
 * «Depurado»). `entraCuando` y `laMueve` son lo que HubSpot entiende por cada una: se usan solo si el agente no la llenó.
 */
export const ETAPAS_DE_HUBSPOT = [
  {
    id: "suscriptor",
    etapa: "Suscriptor",
    entraCuando: "Se suscribe al blog o al boletín: todavía no pidió nada",
    laMueve: "El formulario de suscripción",
  },
  {
    id: "lead",
    etapa: "Lead",
    entraCuando: "Deja sus datos o entra a la base, y todavía nadie lo calificó",
    laMueve: "Un formulario, una importación o una persona",
  },
  {
    id: "mql",
    etapa: "MQL (Lead calificado por marketing)",
    entraCuando: "Marketing lo genera o lo califica: cumple el perfil o mostró interés",
    laMueve: "Marketing: un formulario, una campaña o una automatización",
  },
  {
    id: "sql",
    etapa: "SQL (Lead calificado por ventas)",
    entraCuando: "Una persona de Ventas acepta el MQL, o Ventas lo genera o lo valida directamente",
    laMueve: "Una persona de Ventas, al aceptarlo",
  },
  { id: "oportunidad", etapa: "Oportunidad", entraCuando: "Se le abre un negocio", laMueve: "Una automatización al crear el negocio" },
  { id: "cliente", etapa: "Cliente", entraCuando: "Gana su primer negocio", laMueve: "Una automatización al ganar el negocio" },
  { id: "promotor", etapa: "Promotor", entraCuando: "Recomienda o refiere a otros", laMueve: "Una persona o una encuesta de satisfacción" },
] as const;

export type EtapaDeHubspot = (typeof ETAPAS_DE_HUBSPOT)[number]["id"];

const minusculas = (s: string) => sinTildes(s).toLowerCase().replace(/\s+/g, " ").trim();

/** Los nombres que ya son el de HubSpot (en español o en inglés): con estos no hace falta decir cómo lo llamaba el agente. */
const NOMBRES_DE_HUBSPOT = new Set(
  [
    ...ETAPAS_DE_HUBSPOT.map((e) => e.etapa),
    "suscriptor", "subscriber", "lead", "mql", "sql", "lead calificado por marketing", "lead calificado por ventas",
    "marketing qualified lead", "sales qualified lead", "oportunidad", "opportunity", "cliente", "customer", "promotor", "evangelist",
  ].map(minusculas),
);

/**
 * Un nombre de SALIDA del embudo («Lead descalificado», «Lead descartado», «Cliente perdido», «Ex cliente»): no es la
 * condición para ENTRAR a ninguna etapa. Va al estado del lead, que es donde HubSpot lo deja («Descartado»). Sin esto,
 * «descalificado» caía en MQL por contener «calificad», y la fila decía «no cumple el perfil» como condición de entrada.
 */
export function esSalidaDelEmbudo(nombre: unknown): boolean {
  return /descalific|no calificad|descart|perdid|\bex[ -]?cliente|churn|rechazad|dad[oa] de baja/.test(minusculas(txt(nombre)));
}

/** A cuál de las 7 corresponde un nombre de etapa. `null` si no es ninguna («Contacto base», «Depurado», «Otro»). */
export function etapaDeHubspot(nombre: unknown): EtapaDeHubspot | null {
  const t = minusculas(txt(nombre));
  if (!t || esSalidaDelEmbudo(t)) return null;
  if (/\bsql\b|calificad[oa] por ventas|aceptad[oa] por ventas|sales qualified/.test(t)) return "sql";
  if (/\bmql\b|calificad[oa] por marketing|marketing qualified/.test(t)) return "mql";
  if (/oportunidad|opportunit/.test(t)) return "oportunidad";
  if (/promotor|evangel|embajador|advocate/.test(t)) return "promotor";
  if (/suscri|subscri/.test(t)) return "suscriptor";
  if (/cliente potencial|prospect|\bleads?\b/.test(t)) return /calificad/.test(t) ? "mql" : "lead";
  if (/\bclientes?\b|customer/.test(t)) return "cliente";
  return null;
}

/** ¿La etapa no se usa en el modelo de venta del cliente? (`seUsa` = 'no'; lo de antes, sin el campo, se usa). */
export function etapaSinUso(e: { seUsa?: unknown } | null | undefined): boolean {
  // El agente a veces escribe «No aplica» o «N/A» en vez de «no»: es lo mismo.
  return /^(no|false|no aplica|no se usa|n\/a)$/i.test(txt(e?.seUsa).trim());
}

/** El porqué de una etapa que no se usa cuando nadie lo escribió. */
export const NO_SE_USA = "No se usa en este modelo de venta";

/**
 * La etapa con el uso cambiado a mano (el botón de la tabla). Al apagarla, el criterio y quién la mueve dejan de valer: queda
 * el porqué. Al encenderla, el porqué deja de valer: vuelve la definición de HubSpot de esa etapa (si es una de las 7).
 */
export function conUsoCambiado(e: EtapaDeCiclo, usar: boolean): EtapaDeCiclo {
  if (!usar) return { ...e, seUsa: "no", entraCuando: NO_SE_USA, laMueve: "" };
  const h = ETAPAS_DE_HUBSPOT.find((x) => x.id === etapaDeHubspot(e.etapa));
  return { ...e, seUsa: "si", entraCuando: h?.entraCuando ?? "", laMueve: h?.laMueve ?? "" };
}

/** «Nombre: criterio», o solo uno de los dos. */
const conNombre = (nombre: string, criterio: string) => (criterio ? (nombre ? `«${nombre}»: ${criterio}` : criterio) : nombre ? `«${nombre}»` : "");

/** Lo más débil manda: una fila con algo supuesto es un supuesto, aunque el resto se haya acordado. "" = no se sabe. */
const PESO_DEL_ORIGEN: Record<string, number> = { supuesto: 1, propuesta: 2, acordado: 3 };
function origenMasDebil(origenes: readonly string[]): string {
  let mejor = "";
  for (const o of origenes) {
    const n = normalizarOrigen(o);
    if (n && (!mejor || PESO_DEL_ORIGEN[n] < PESO_DEL_ORIGEN[mejor])) mejor = n;
  }
  return mejor;
}

const unicos = (xs: readonly string[]) => xs.filter((x, i) => x && xs.findIndex((y) => minusculas(y) === minusculas(x)) === i);

/**
 * Lo que devolvió el agente → las 7 etapas de HubSpot, en su orden. Se aplica al GENERAR o REGENERAR, nunca al leer: lo
 * que una persona escribió a mano en un documento se sigue viendo como está.
 *
 *  · Una fila que nombra una de las 7 le da su criterio y quién la mueve. Si el nombre era otro («Cliente activo»), el
 *    criterio lo dice: «Cliente activo»: compró en los últimos 12 meses.
 *  · Una fila que no es ninguna («Contacto base», «Depurado») no se pierde: pasa al criterio de la etapa que tenía antes
 *    en la lista (o a Lead, si era de las primeras), como «También «Depurado»: …», y quién la mueve se suma al de la etapa.
 *  · Una SALIDA del embudo («Lead descalificado», «Cliente perdido») no es condición de entrada: pasa al estado del lead.
 *  · Una etapa que el agente no escribió lleva la definición de HubSpot, como propuesta.
 *  · El origen de cada fila es el más débil de lo que la forma (un supuesto sumado a algo acordado la deja en supuesto).
 *  · Los estados del lead: los de antes se quedan y se suman los nuevos que no estaban (por nombre).
 *  · El `cambio` (nueva / se renombra / se quita) ya no aplica: las 7 se mantienen siempre.
 *  · Una etapa que el agente marcó `seUsa: 'no'` (venta directa sin vendedores en el CRM: MQL, SQL, Oportunidad) se
 *    queda en la lista con su porqué, sin quién la mueve ni la definición de HubSpot, y no recibe filas ajenas: una que no
 *    es ninguna de las 7 va a la etapa anterior que SÍ se usa.
 */
export function normalizarCicloDeVida(nuevo: unknown, previo?: unknown): CicloDeVidaData {
  const d = (nuevo ?? {}) as Record<string, unknown>;
  const filas = arr<Record<string, unknown>>(d.etapas).filter((e) => e && typeof e === "object");
  const ids = filas.map((f) => etapaDeHubspot(f.etapa));
  const lugar = (x: EtapaDeHubspot) => ETAPAS_DE_HUBSPOT.findIndex((e) => e.id === x);

  type Base = { entraCuando: string; laMueve: string[]; origenes: string[]; extras: string[]; tiene: boolean; sinUso: boolean };
  const porEtapa = new Map<EtapaDeHubspot, Base>(
    ETAPAS_DE_HUBSPOT.map((e) => [e.id, { entraCuando: "", laMueve: [], origenes: [], extras: [], tiene: false, sinUso: false }]),
  );
  /* Primero, qué etapas no se usan: una fila que nombra la etapa y la marca `seUsa: 'no'` le da su porqué. Va antes que
     el resto para que ninguna fila caiga en una etapa apagada por venir antes en la lista (revisión del 12 nov). */
  const marcadas = new Set<number>();
  filas.forEach((f, i) => {
    const id = ids[i];
    if (!id || !etapaSinUso(f) || esSalidaDelEmbudo(f.etapa)) return;
    marcadas.add(i);
    const b = porEtapa.get(id)!;
    if (b.sinUso) return;
    b.sinUso = true;
    b.entraCuando = txt(f.entraCuando).trim();
    b.origenes.push(txt(f.origen).trim());
  });
  const usada = (x: EtapaDeHubspot | null | undefined): x is EtapaDeHubspot => !!x && !porEtapa.get(x)!.sinUso;
  /* Dónde va lo que no es una etapa que se usa: a la anterior en la lista que SÍ se usa. Si era de las primeras, a Lead
     (donde entra todo contacto), salvo que la de después sea anterior a Lead (Suscriptor); con Lead apagada, a la primera
     que se usa desde Lead. Con Cemaco, «Contacto en base» iba antes de «Cliente activo»: mandarla a la de después la hacía
     cliente. */
  const destinoDe = (i: number): Base => {
    const antes = ids.slice(0, i).reverse().find(usada);
    if (antes) return porEtapa.get(antes)!;
    const despues = ids.slice(i + 1).find(usada);
    if (despues && lugar(despues) < lugar("lead")) return porEtapa.get(despues)!;
    const desdeLead = ETAPAS_DE_HUBSPOT.slice(lugar("lead")).find((e) => usada(e.id)) ?? ETAPAS_DE_HUBSPOT.find((e) => usada(e.id));
    return porEtapa.get(desdeLead?.id ?? "lead")!;
  };
  const salidas: EstadoDelLead[] = [];
  filas.forEach((f, i) => {
    if (marcadas.has(i)) return;
    const nombre = txt(f.etapa).trim();
    const criterio = txt(f.entraCuando).trim();
    const mueve = txt(f.laMueve).trim();
    const origen = txt(f.origen).trim();
    if (!nombre && !criterio) return;
    if (esSalidaDelEmbudo(nombre)) {
      salidas.push({ estado: nombre, significa: [criterio, mueve && `la mueve: ${mueve}`].filter(Boolean).join(" · "), origen });
      return;
    }
    const id = ids[i];
    if (usada(id)) {
      const b = porEtapa.get(id)!;
      const propio = NOMBRES_DE_HUBSPOT.has(minusculas(nombre)) ? criterio : conNombre(nombre, criterio);
      if (!b.tiene) {
        b.tiene = true;
        b.entraCuando = propio;
        b.laMueve.unshift(mueve); // Quien mueve la etapa misma va primero; lo sumado, después.
      } else {
        if (propio) b.extras.push(propio);
        b.laMueve.push(mueve);
      }
      b.origenes.push(origen);
      return;
    }
    // No es ninguna de las 7, o es una que no se usa («Lead calificado» con MQL apagada): a la anterior que se usa.
    const destino = destinoDe(i);
    destino.extras.push(`También ${conNombre(nombre, criterio)}`);
    destino.laMueve.push(mueve);
    destino.origenes.push(origen);
  });

  const etapas: EtapaDeCiclo[] = ETAPAS_DE_HUBSPOT.map((e) => {
    const b = porEtapa.get(e.id)!;
    const mueven = unicos(b.laMueve);
    if (b.sinUso) {
      return {
        etapa: e.etapa,
        seUsa: "no",
        entraCuando: [b.entraCuando || NO_SE_USA, ...b.extras].join(" · "),
        laMueve: "",
        origen: origenMasDebil(b.origenes.length ? b.origenes : ["propuesta"]),
      };
    }
    return {
      etapa: e.etapa,
      entraCuando: [b.entraCuando || e.entraCuando, ...b.extras].join(" · "),
      laMueve: mueven.length ? mueven.join(" · ") : e.laMueve,
      // La que no escribió nadie es la definición de HubSpot: una propuesta, que pesa junto con lo que se le sumó.
      origen: origenMasDebil([...b.origenes, ...(b.tiene && b.entraCuando ? [] : ["propuesta"])]),
    };
  });

  const previos = arr<EstadoDelLead>(((previo ?? {}) as Record<string, unknown>).estadosLead).filter((e) => e && typeof e === "object");
  const vistos = new Set(previos.map((e) => minusculas(txt(e.estado))).filter(Boolean));
  const nuevos = [...arr<EstadoDelLead>(d.estadosLead), ...salidas].filter((e) => {
    const k = minusculas(txt(e?.estado));
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  return { ...d, intro: txt(d.intro), etapas, estadosLead: [...previos, ...nuevos] };
}

/**
 * Lo que se guarda del ciclo de vida al generar: las 7 etapas (`normalizarCicloDeVida`). Salvo un caso: si el agente no
 * devolvió ninguna etapa y el documento ya tenía, se queda lo que había (escrito a mano o no) y solo se le suman los estados
 * del lead nuevos. Rellenar con la definición de HubSpot, o dejarlo vacío, pisaría lo que ya estaba.
 */
export function cicloDeVidaGenerado(nuevo: unknown, previo?: unknown): unknown {
  const conEtapas = (v: unknown) =>
    arr<Record<string, unknown>>((v as Record<string, unknown> | null)?.etapas).some((e) => txt(e?.etapa).trim() || txt(e?.entraCuando).trim());
  const p = (previo ?? {}) as Record<string, unknown>;
  if (!conEtapas(nuevo) && (conEtapas(p) || arr(p.items).length > 0)) {
    const previos = arr<EstadoDelLead>(p.estadosLead).filter((e) => e && typeof e === "object");
    const vistos = new Set(previos.map((e) => minusculas(txt(e.estado))).filter(Boolean));
    const nuevos = arr<EstadoDelLead>(((nuevo ?? {}) as Record<string, unknown>).estadosLead).filter((e) => {
      const k = minusculas(txt(e?.estado));
      if (!k || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    return { ...p, estadosLead: [...previos, ...nuevos] };
  }
  return normalizarCicloDeVida(nuevo, previo);
}

/**
 * Cuántas de las 7 etapas de HubSpot traen una condición PROPIA del cliente (no la definición de HubSpot): es lo que hay
 * que configurar. Solo cuenta filas con el nombre exacto de una de las 7 (un documento de antes, con sus etapas, se mide
 * por su `cambio`, como siempre).
 */
export function condicionesPropiasDelCiclo(etapas: readonly EtapaDeCiclo[]): number {
  return etapas.filter((e) => {
    const h = ETAPAS_DE_HUBSPOT.find((x) => x.etapa === txt(e?.etapa).trim());
    const c = txt(e?.entraCuando).trim();
    // Una etapa que no se usa no se configura: su texto es el porqué, no una condición.
    return !!h && !!c && c !== h.entraCuando && !etapaSinUso(e);
  }).length;
}

/** La prosa vieja (`items` título + detalle) → tabla. El detalle entero queda en «entra cuando». */
export function adoptarCicloDeVida(data: unknown): CicloDeVidaData {
  const d = (data ?? {}) as Record<string, unknown>;
  const etapas = arr<EtapaDeCiclo>(d.etapas);
  const estadosLead = arr<EstadoDelLead>(d.estadosLead);
  if (etapas.length) return { intro: txt(d.intro), etapas, estadosLead };
  return {
    intro: txt(d.intro),
    estadosLead,
    etapas: arr<Record<string, unknown>>(d.items)
      .filter((i) => txt(i.title).trim() || txt(i.detail).trim())
      .map((i) => ({ etapa: txt(i.title), entraCuando: txt(i.detail), laMueve: "", cambio: "", origen: "" })),
  };
}

/* ── Pipelines ──────────────────────────────────────────────────────────────── */

export const TIPOS_DE_PIPELINE = [
  { value: "leads", label: "Leads" },
  { value: "ventas", label: "Ventas" },
  { value: "servicio", label: "Servicio" },
  { value: "otro", label: "Otro" },
] as const;

export const CIERRES_DE_ETAPA = [
  { value: "", label: "Abierta" },
  { value: "ganado", label: "Cierra ganada" },
  { value: "perdido", label: "Cierra perdida" },
] as const;

export interface EtapaDePipeline {
  etapa: string;
  entraCuando?: string;
  /** Lo que tiene que estar completo para avanzar, separado por comas. */
  requisitos?: string;
  /** "" | ganado | perdido. */
  cierre?: string;
  /** Lo que pasa solo al entrar a la etapa (2026-10-25, el Brief: «Propiedad condicional de Razón de pérdida»). */
  automatizacion?: string;
  origen?: string;
}
export interface Pipeline {
  tipo: string;
  nombre: string;
  objeto?: string;
  /** Una línea de contexto. En los pipelines que vinieron de Ejecución, el texto de las etapas. */
  nota?: string;
  origen?: string;
  etapas: EtapaDePipeline[];
}
export interface PipelinesData {
  intro?: string;
  pipelines: Pipeline[];
}

/** Leads, ventas o servicio, por las palabras del nombre o del objeto. */
export function inferirTipoDePipeline(...textos: unknown[]): string {
  const t = sinTildes(textos.map(txt).join(" ")).toLowerCase();
  if (/\blead/.test(t)) return "leads";
  if (/ticket|servicio|soporte|ayuda|atencion/.test(t)) return "servicio";
  if (/negocio|venta|deal|admision|comercial|oportunidad/.test(t)) return "ventas";
  return "otro";
}

/**
 * Los pipelines que vinieron de Ejecución (`procesos` con nombre / comoEsHoy / comoSera / sistemas)
 * → la forma nueva. El texto de las etapas propuestas queda como nota del pipeline: partirlo en
 * etapas sería adivinar dónde termina cada una.
 */
export function adoptarPipelines(data: unknown): PipelinesData {
  const d = (data ?? {}) as Record<string, unknown>;
  const pipelines = arr<Pipeline>(d.pipelines);
  if (pipelines.length || !Array.isArray(d.procesos)) {
    return { intro: txt(d.intro), pipelines: pipelines.map((p) => ({ ...p, etapas: arr<EtapaDePipeline>(p.etapas) })) };
  }
  return {
    intro: txt(d.intro),
    pipelines: arr<Record<string, unknown>>(d.procesos)
      .filter((p) => txt(p.nombre).trim())
      .map((p) => ({
        tipo: inferirTipoDePipeline(p.nombre, p.sistemas),
        nombre: txt(p.nombre),
        objeto: txt(p.sistemas),
        nota: txt(p.comoSera),
        origen: "",
        etapas: [],
      })),
  };
}

/** «Proyecto, Tipo de programa» → ["Proyecto", "Tipo de programa"]. */
export function listaDeRequisitos(v: unknown): string[] {
  return txt(v)
    .split(/[,;·\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ── Automatizaciones ───────────────────────────────────────────────────────── */

export interface Automatizacion {
  nombre: string;
  /** Objeto y hub, en una línea: «Contacto · Marketing Hub». */
  donde?: string;
  cuando?: string;
  hace?: string;
  resuelve?: string;
  /** Lo que todavía no está definido. */
  falta?: string;
  /* 2026-10-25 — la forma del Brief: la condición que la bifurca, qué pasa en cada rama, lo que hay que
     tener en cuenta y la vista (el filtro) que deja armada. Todo opcional: una lineal no los usa. */
  condicion?: string;
  siCumple?: string;
  noCumple?: string;
  considerar?: string;
  vista?: string;
  origen?: string;
  fuente?: string;
}
export interface AutomatizacionesData {
  intro?: string;
  items: Automatizacion[];
}

/**
 * LO TÉCNICO DE UNA AUTOMATIZACIÓN (Elías, 12 nov 2026: las tarjetas con CUANDO / HACE / SI… / SE CUMPLE… no se leían).
 * La sección pasa a una fila por automatización (Automatización · Cuándo pasa · Qué hace · Para qué sirve · Estado), y
 * estos campos quedan plegados en «Ver detalle», SOLO para el equipo: nunca en el enlace del cliente, en el PDF ni en la
 * foto publicada. Se guardan igual (nada se borra): cambia lo que se ve.
 */
export const CAMPOS_TECNICOS_DE_AUTOMATIZACION = ["condicion", "siCumple", "noCumple", "vista", "considerar", "falta", "fuente"] as const satisfies ReadonlyArray<keyof Automatizacion>;

/**
 * Lo que sale hacia el cliente (la foto al publicar, el enlace): las automatizaciones sin su detalle técnico. Las demás
 * secciones pasan igual. Se saca de la DATA, no solo del render, para que no viaje al navegador del cliente.
 */
export function sinLoTecnicoDeLaPlanificacion<T>(key: string, data: T): T {
  if (key !== "automatizaciones" || !data || typeof data !== "object" || Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.items)) return data;
  const tecnicos = new Set<string>(CAMPOS_TECNICOS_DE_AUTOMATIZACION);
  return {
    ...d,
    items: d.items.map((i) =>
      i && typeof i === "object" && !Array.isArray(i) ? Object.fromEntries(Object.entries(i).filter(([k]) => !tecnicos.has(k))) : i,
    ),
  } as T;
}

/** Los «procesos de marketing» de Ejecución (prosa título + detalle) → automatizaciones. */
export function adoptarAutomatizaciones(data: unknown): AutomatizacionesData {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    intro: txt(d.intro),
    items: arr<Record<string, unknown>>(d.items)
      .filter((i) => txt(i.nombre).trim() || txt(i.title).trim() || txt(i.detail).trim())
      .map((i) =>
        txt(i.nombre) || !txt(i.title)
          ? (i as unknown as Automatizacion)
          : { nombre: txt(i.title), donde: "", cuando: "", hace: txt(i.detail), resuelve: "", falta: "", origen: "", fuente: "" },
      ),
  };
}

/* ── Conversaciones (mensajería instantánea y agentes de IA) ───────────────── */

export const QUIEN_RESPONDE = [
  { value: "persona", label: "Una persona" },
  { value: "chatbot", label: "Chatbot con reglas" },
  { value: "agente_ia", label: "Agente de IA" },
] as const;

export interface Conversacion {
  nombre: string;
  /** Canal y hub: «WhatsApp Business · Service Hub». */
  canal?: string;
  /** persona | chatbot | agente_ia. */
  responde?: string;
  paraQue?: string;
  pasaA?: string;
  registra?: string;
  falta?: string;
  /** Quiénes atienden cuando pasa a una persona (2026-10-25, el Brief). */
  atienden?: string;
  /** El guion de un chatbot: el saludo y los pasos, en orden (2026-10-25, el Brief). */
  guion?: string[];
  origen?: string;
  fuente?: string;
}
export interface ConversacionesData {
  intro?: string;
  items: Conversacion[];
}

export function adoptarConversaciones(data: unknown): ConversacionesData {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    intro: txt(d.intro),
    items: arr<Conversacion>(d.items).map((c) => (Array.isArray(c.guion) ? { ...c, guion: c.guion.map(txt) } : c)),
  };
}

/* ── Utilidad de los renderers ──────────────────────────────────────────────── */

/** Mueve el elemento `i` una posición (`-1` antes, `+1` después). Fuera de rango, igual. */
export function mover<T>(lista: readonly T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return lista.slice();
  const copia = lista.slice();
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}
