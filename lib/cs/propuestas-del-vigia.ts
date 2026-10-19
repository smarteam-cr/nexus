/**
 * lib/cs/propuestas-del-vigia.ts — LAS PROPUESTAS DE SALUD DEL VIGÍA, EN PALABRAS (2026-10-19). PURO.
 *
 * El vigía mira el cronograma de cada proyecto de la cartera. Cuando ve fases vencidas o semanas sin avance
 * (`riskCandidate` de lib/portfolio/summary.ts), PROPONE pasar la SALUD del proyecto a «En riesgo»
 * (`Project.healthProposed`). Nada cambia hasta que alguien de la CSL o dirección la confirma o la descarta en UN solo
 * lugar: Éxito del cliente › «Propuestas del vigía» (`RUTA_DE_LAS_PROPUESTAS`).
 *
 * Lo que arregló este archivo (lo vio Elías con Alex Vanegas, 2026-10-19):
 * · El aviso decía «cambiar el ESTADO», y en la ficha, al lado, estaba el estado de HubSpot («A tiempo») y otro chip
 *   que proponía «Pasar a Retrasado» en HubSpot. Lo que propone el vigía es la SALUD de Nexus: se dice así, con el
 *   «de… a…».
 * · No decía por qué. El porqué se arma ACÁ, con las señales de hoy (`razonDelRiesgo`): el texto que guardó el vigía
 *   el día que propuso se queda viejo («sin avance hace 18 días» cuando ya van 31).
 * · Contaba propuestas que ya no aplican: el vigía las limpia solo cuando vuelve a correr para ese proyecto, y hoy corre
 *   al entrar a la cuenta. `estadoDeLaPropuesta` las deja fuera del número y de la lista si alguien ya fijó la salud a
 *   mano o si la señal desapareció.
 * · El botón llevaba a la ficha de UNA cuenta, y para decidir las otras había que volver y saltar de cuenta en cuenta.
 */

export type Salud = "SALUDABLE" | "EN_FRICCION" | "EN_RIESGO" | "PAUSADO";

export const NOMBRE_DE_LA_SALUD: Record<Salud, string> = {
  SALUDABLE: "Saludable",
  EN_FRICCION: "En fricción",
  EN_RIESGO: "En riesgo",
  PAUSADO: "Pausado",
};

/** El único lugar donde se decide una propuesta de salud del vigía. */
export const RUTA_DE_LAS_PROPUESTAS = "/customer-success/propuestas";

/** La lista, abierta en una propuesta (`?proyecto=`): la resalta y la deja a la vista. */
export function rutaDeLaPropuesta(projectId?: string | null): string {
  return projectId ? `${RUTA_DE_LAS_PROPUESTAS}?proyecto=${encodeURIComponent(projectId)}` : RUTA_DE_LAS_PROPUESTAS;
}

/** Las señales duras del cronograma que hacen proponer «En riesgo» (los campos del summary). */
export interface SenalesDelRiesgo {
  overduePhases: number;
  worstOverduePhase: { name: string; daysLate: number } | null;
  stalled: boolean;
  daysSinceActivity: number | null;
}

/**
 * Por qué, en una línea: «3 fases vencidas; la peor, «Integración En Control», va 48 días tarde · sin avance hace 31
 * días». La usa el vigía al proponer y la pantalla al mostrar, así dicen lo mismo.
 */
export function razonDelRiesgo(s: SenalesDelRiesgo): string {
  const partes: string[] = [];
  if (s.overduePhases > 0) {
    const fases = s.overduePhases === 1 ? "1 fase vencida" : `${s.overduePhases} fases vencidas`;
    const peor = s.worstOverduePhase;
    if (peor) {
      const dias = peor.daysLate === 1 ? "1 día" : `${peor.daysLate} días`;
      partes.push(s.overduePhases === 1 ? `${fases}: «${peor.name}» va ${dias} tarde` : `${fases}; la peor, «${peor.name}», va ${dias} tarde`);
    } else {
      partes.push(fases);
    }
  }
  if (s.stalled) {
    partes.push(s.daysSinceActivity !== null ? `sin avance hace ${s.daysSinceActivity === 1 ? "1 día" : `${s.daysSinceActivity} días`}` : "sin avance");
  }
  return partes.join(" · ") || "señales del cronograma";
}

export type EstadoDeLaPropuesta = "vigente" | "ya-decidida" | "sin-senal";

/**
 * Si una propuesta guardada todavía pide decisión. `null` = no hay propuesta.
 * · Alguien ya fijó la salud a mano (`saludFijada`) → ya está decidida: la persona manda.
 * · Las señales que la hicieron proponer ya no están (`riskCandidate` falso: se pusieron al día las fases, se pausó o
 *   terminó el proyecto) → ya no aplica. El vigía la borra la próxima vez que corra; mientras tanto, no se cuenta.
 */
export function estadoDeLaPropuesta(p: {
  propuesta: Salud | null;
  saludFijada: Salud | null;
  riskCandidate: boolean;
}): EstadoDeLaPropuesta | null {
  if (!p.propuesta) return null;
  if (p.saludFijada) return "ya-decidida";
  if (!p.riskCandidate) return "sin-senal";
  return "vigente";
}

/** Una propuesta lista para mostrar. */
export interface PropuestaDelVigia {
  projectId: string;
  proyecto: string;
  clientId: string;
  cuenta: string;
  cse: string | null;
  /** La salud que tiene hoy (la que calcula Nexus: no hay ninguna fijada a mano). */
  actual: Salud;
  propuesta: Salud;
  /** Por qué, con las señales de hoy. */
  razon: string;
  /** Desde cuándo espera (ISO). */
  desde: string | null;
}

/** «de «En fricción» a «En riesgo»». */
export function queCambia(p: Pick<PropuestaDelVigia, "actual" | "propuesta">): string {
  return `de «${NOMBRE_DE_LA_SALUD[p.actual]}» a «${NOMBRE_DE_LA_SALUD[p.propuesta]}»`;
}

/** «Areya - MKT + CRM: de «En fricción» a «En riesgo»». */
export function lineaDeLaPropuesta(p: Pick<PropuestaDelVigia, "proyecto" | "actual" | "propuesta">): string {
  return `${p.proyecto}: ${queCambia(p)}`;
}

/** La que más espera primero; sin fecha, al final. */
export function ordenarPropuestas<T extends Pick<PropuestaDelVigia, "desde" | "cuenta" | "proyecto">>(ps: readonly T[]): T[] {
  const t = (d: string | null) => (d ? Date.parse(d) : Number.POSITIVE_INFINITY);
  return [...ps].sort((a, b) => t(a.desde) - t(b.desde) || a.cuenta.localeCompare(b.cuenta, "es") || a.proyecto.localeCompare(b.proyecto, "es"));
}

export interface AvisoDeLasPropuestas {
  titulo: string;
  detalle: string;
  accion: string;
  href: string;
  /** Con varias: cada una, con su enlace a la MISMA lista abierta en ella. */
  enlaces?: { texto: string; href: string }[];
  /** La cuenta, solo si todas son de una. */
  clientId: string | null;
  desde: string | null;
}

/**
 * La línea de «Para ti». Una sola, con todas: se deciden en la misma lista, una por una, sin saltar de cuenta en
 * cuenta. `null` = no hay nada que decidir.
 */
export function avisoDeLasPropuestas(todas: readonly PropuestaDelVigia[]): AvisoDeLasPropuestas | null {
  const ps = ordenarPropuestas(todas);
  if (ps.length === 0) return null;
  const p = ps[0];
  const cuentas = new Set(ps.map((x) => x.clientId));
  if (ps.length === 1) {
    return {
      titulo: `${p.cuenta} · ${lineaDeLaPropuesta(p)}`,
      detalle: `Por qué: ${p.razon}. Nada cambia hasta que lo confirmes o lo descartes.`,
      accion: "Decidir",
      href: rutaDeLaPropuesta(p.projectId),
      clientId: p.clientId,
      desde: p.desde,
    };
  }
  const destinos = new Set(ps.map((x) => x.propuesta));
  const titulo =
    destinos.size === 1
      ? `El vigía propone pasar ${ps.length} proyectos a «${NOMBRE_DE_LA_SALUD[p.propuesta]}»`
      : `El vigía propone cambiar la salud de ${ps.length} proyectos`;
  const repetidas = new Map<string, number>();
  for (const x of ps) repetidas.set(x.clientId, (repetidas.get(x.clientId) ?? 0) + 1);
  return {
    titulo: cuentas.size === 1 ? `${titulo} de ${p.cuenta}` : titulo,
    detalle: `La que más espera: ${p.cuenta} · ${lineaDeLaPropuesta(p)} (${p.razon}). Se deciden una por una en «Propuestas del vigía»; nada cambia solo.`,
    accion: "Decidir una por una",
    href: rutaDeLaPropuesta(p.projectId),
    enlaces: ps.map((x) => ({
      texto: (repetidas.get(x.clientId) ?? 0) > 1 ? `${x.cuenta} · ${x.proyecto}` : x.cuenta,
      href: rutaDeLaPropuesta(x.projectId),
    })),
    clientId: cuentas.size === 1 ? p.clientId : null,
    desde: p.desde,
  };
}

/** Qué propuesta resaltar al abrir la lista: la pedida (`?proyecto=`) si sigue en la lista; si no, la que más espera. */
export function propuestaDestacada(ps: readonly Pick<PropuestaDelVigia, "projectId">[], pedida: string | null | undefined): string | null {
  if (pedida && ps.some((p) => p.projectId === pedida)) return pedida;
  return ps[0]?.projectId ?? null;
}
