/**
 * lib/casos-de-uso/actividades.ts — cómo se arma cada caso del catálogo: la biblioteca de actividades y las filas de
 * cada caso (borrador para la revisión de Elías; el porqué, en docs/actividades-plan.md).
 *
 * Tres niveles: el caso es el resultado; «Lo que se entrega» es lo que ve el cliente; las actividades son internas y
 * cada una lleva un solo tiempo de la biblioteca. El cliente nunca ve actividades ni horas. El precio de referencia
 * es horas × tarifa del segmento.
 *
 * La forma es la de una base de datos (pedido de Elías del 2026-11-05: con esto se arman los casos y, después, la
 * cotización). Dos tablas y una vista:
 *  - `ActividadDeLaBiblioteca`: una fila por actividad, con un `id` estable (los casos y la cotización apuntan ahí, así
 *    que renombrarla no rompe nada) y sus campos: etapa, horas, cómo se cuenta (`unidad`, `seRepite`), cómo se
 *    comparte, a qué equipos se aplica, qué incluye, sus reglas, lo que pide al cliente y su licencia.
 *  - `FilaGuardada`: una fila por actividad de un caso. Solo guarda lo propio del caso (cómo se llama ahí, las veces,
 *    si viene marcada, sobre qué, qué se hace, cuándo cambia y qué línea de la propuesta sostiene); el tiempo, la etapa
 *    y cómo se comparte salen de la biblioteca, nunca se copian.
 *  - `FilaDelCaso`: la vista que arma `leerActividades` juntando las dos. Las horas de un caso tampoco se guardan: se
 *    suman de sus filas.
 *
 * «Sobre qué» (antes «cosa»): lo que dice de qué trata una actividad que se comparte, como «WhatsApp» en «Conectar un
 * canal». Si dos casos de la misma venta traen la misma actividad sobre lo mismo, se cobra una vez.
 *
 * Cada actividad es una ACCIÓN del equipo (consenso con Elías del 2026-11-06): la biblioteca tiene acciones generales
 * («Consensuar una configuración», «Configurar en HubSpot», «Diseñar el proceso en HubSpot») y cada fila de un caso
 * dice la concreta («Configurar la aprobación de cotizaciones»), con su «sobre qué». Lo extra se ve en que la fila viene
 * sin marcar (+), no en una etiqueta.
 *
 * Los datos viven en `actividades-de-los-casos.json`, la ÚNICA fuente (un cambio se hace ahí; no hay otra copia que
 * generar), y se leen solo en el servidor (`actividades-server.ts`): pesan casi 1 MB. Este archivo es puro: tipos, la
 * validación y las cuentas.
 */
import { z } from "zod";
import { ETAPAS_DE_ACTIVIDAD, formatoHoras, sobreQueAparte, type ComoSeComparte, type EtapaDeActividad } from "./actividades-puras";

export { ETAPAS_DE_ACTIVIDAD, TARIFAS, formatoHoras, formatoUsd, sobreQueAparte, type ComoSeComparte, type EtapaDeActividad } from "./actividades-puras";

const CLAVES_DE_ETAPA = ETAPAS_DE_ACTIVIDAD.map((e) => e.clave) as [EtapaDeActividad, ...EtapaDeActividad[]];



const Comparte = z.enum(["venta", "sobreQue", "no"]);

/** Los equipos del cliente a los que se aplica una actividad. «Todos» es cualquiera (el Kickoff, Capacitar…). */
export const EQUIPOS_DEL_CLIENTE = ["Ventas", "Marketing", "Servicio", "Customer Success", "Cobranza", "Dirección", "TI", "Comercio en línea", "Todos"] as const;

const CLAVE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Una parte del tiempo de una actividad (pedido de Elías del 2026-11-05): cuánto es sesión con el cliente y cuánto
 * trabajo interno. Sirve a la cotización, al cronograma (una sesión pide la agenda del cliente) y a la rentabilidad.
 */
const Parte = z.object({
  clave: z.string().regex(CLAVE),
  nombre: z.string().min(1),
  /** Horas de una vez de la parte. */
  horas: z.number().positive(),
  conElCliente: z.boolean(),
  /** Las veces por defecto dentro de una vez de la actividad; 0 si es opcional (se suma cuando aplica). */
  veces: z.number().int().min(0),
  /** Si un caso puede cambiarle las veces (las sesiones del mapeo, por ejemplo: dos por defecto, una si es simple). */
  variable: z.boolean(),
});

const ActividadDeLaBiblioteca = z.object({
  /** Estable: lo usan las filas de los casos y, mañana, la cotización. */
  id: z.string().regex(CLAVE),
  nombre: z.string().min(1),
  etapa: z.enum(CLAVES_DE_ETAPA),
  /** Qué es y para qué sirve, en una frase. */
  resumen: z.string().min(1).max(160),
  /** Lo que se hace, en viñetas. */
  incluye: z.array(z.string().min(1)).min(1).max(6),
  /** De qué se cuenta una vez: «sesión», «proceso», «venta»… */
  unidad: z.string().min(1),
  /** Si en un mismo caso puede ir más de una vez (sus `veces`). */
  seRepite: z.boolean(),
  comparte: Comparte,
  /** Los «sobre qué» posibles cuando se comparte así. «<…>» es un nombre por llenar. */
  sobreQue: z.array(z.string()),
  equipos: z.array(z.enum(EQUIPOS_DEL_CLIENTE)).min(1),
  quien: z.string(),
  /** Horas por vez. 0 cuando el tiempo lo define Diseño o Dev (`horasPendientes`). */
  horas: z.number().min(0),
  horasTexto: z.string(),
  horasPendientes: z.boolean(),
  /** El tiempo es una estimación que hay que medir en los primeros proyectos. */
  esEstimacion: z.boolean(),
  /** De qué está hecho el tiempo: sus partes suman `horas`. Vacío si lo define Diseño o Dev. */
  partes: z.array(Parte),
  /** Cuándo va, cómo se cuenta y cómo se comparte, en viñetas. */
  reglas: z.array(z.string().min(1)).max(6),
  /** La frontera con otras actividades: «No es «X»: …». */
  noEs: z.array(z.string().min(1)).max(3),
  /** Lo que pone el cliente, en viñetas (de ahí sale «Lo que necesitamos del cliente»). */
  pideAlCliente: z.array(z.string().min(1)).max(4),
  /** Lo que pide de licencia, plan o créditos; vacío si nada. */
  licencia: z.string(),
  /** El documento que deja en Nexus; vacío si ninguno. */
  deja: z.string(),
  esNueva: z.boolean(),
});

/** Lo que se guarda de una actividad en un caso: solo lo propio del caso. */
const FilaGuardada = z.object({
  actividadId: z.string().min(1),
  /** Cómo se llama en este caso: «Diseñar el proceso de ventas en HubSpot». Es lo que se lee en la ficha. */
  nombre: z.string().min(1),
  queSeHace: z.string(),
  veces: z.number().int().min(1),
  /** Viene marcada; si no, el vendedor la marca cuando aplica (`cuandoCambia`). */
  porDefecto: z.boolean(),
  cuandoCambia: z.string(),
  /** De qué trata, cuando se comparte por «sobre qué» («WhatsApp»…). Vacío si no lo dice. */
  sobreQue: z.string(),
  /** Las líneas de «Lo que se entrega» que esta fila hace posibles (índices). */
  sostiene: z.array(z.number().int().min(0)),
  /** La línea de «Lo que no incluye» que aparece si la fila no se marca; -1 si ninguna. */
  siNoVa: z.number().int().min(-1),
  /** Solo si en este caso la hace otro rol que el de la biblioteca (Capacitar con Dev, por ejemplo). */
  quien: z.string().optional(),
  /** Las veces de las partes variables en este caso, por su clave (una sola sesión de mapeo: `{ sesion: 1 }`). */
  partes: z.record(z.string(), z.number().int().min(0)).optional(),
});

const CasoGuardado = z.object({
  id: z.string().min(1),
  familia: z.string(),
  /** Vacío en un caso que se cobra una vez; en uno recurrente, cómo se cobra cada período. */
  periodo: z.string(),
  seBuscaComo: z.array(z.string()),
  /** Guía interna para quien vende. El cliente no la ve. */
  paraQuienVende: z.string(),
  /** La venta de referencia sobre la que se cuentan las horas por defecto. */
  escenarioBase: z.string(),
  loQueSeEntrega: z.array(z.string()),
  /** Las líneas de «Lo que se entrega» que dependen de que el equipo del cliente lo use (van con la meta). */
  usoDelEquipo: z.array(z.number().int().min(0)),
  loQueNecesitamosDeTi: z.array(z.string()),
  /**
   * La línea 0 es fija (puede venir vacía); cada una de las demás aparece mientras alguna de sus filas (`siNoVa`) no se
   * marque. Cualquiera, también la 0, puede valer por un solo camino (`lineasPorCamino`).
   */
  loQueNoIncluye: z.array(z.string()),
  /** Los casos que se nombran como aparte en «Lo que no incluye», con las palabras para nombrarlos. */
  casosAparte: z.array(z.object({ id: z.string(), palabras: z.string() })),
  /** Solo en los casos de Insider: las líneas de «Lo que no incluye» que valen por un solo camino. */
  lineasPorCamino: z.array(z.object({ indice: z.number().int().min(0), camino: z.string() })),
  actividades: z.array(FilaGuardada).min(1),
  variantes: z.array(z.object({ nombre: z.string(), cambia: z.string() })),
  /** Lo que queda para que Elías decida sobre este caso. */
  preguntas: z.array(z.string()),
  /** El caso que se vende junto y comparte filas (su requisito): con él se cuentan las horas «junto con lo que requiere». */
  requisito: z.string().nullable(),
});

/** Lo que queda por decidir sobre la biblioteca: de qué trata, la pregunta corta y lo que se propone. */
const PreguntaDeLaBiblioteca = z.object({ tema: z.string().min(1), pregunta: z.string().min(1), propuesta: z.string().min(1) });
export type PreguntaDeLaBiblioteca = z.infer<typeof PreguntaDeLaBiblioteca>;

const DatosGuardados = z.object({
  version: z.string(),
  biblioteca: z.array(ActividadDeLaBiblioteca).min(1),
  casos: z.array(CasoGuardado),
  preguntasDeLaBiblioteca: z.array(PreguntaDeLaBiblioteca),
});

export type ActividadDeLaBiblioteca = z.infer<typeof ActividadDeLaBiblioteca>;
export type ParteDelTiempo = z.infer<typeof Parte>;
type FilaGuardada = z.infer<typeof FilaGuardada>;
type CasoGuardado = z.infer<typeof CasoGuardado>;

/** Una fila del caso con lo que trae de su actividad (la vista que usan la ficha y las cuentas). */
export type FilaDelCaso = Omit<FilaGuardada, "quien" | "partes"> & {
  /** El nombre de la actividad en la biblioteca. */
  actividad: string;
  etapa: EtapaDeActividad;
  quien: string;
  horasPorVez: number;
  horasPendientes: boolean;
  comparte: ComoSeComparte;
  unidad: string;
  seRepite: boolean;
  /** El tiempo de una vez de la fila, por partes, con las veces de este caso. Vacío si lo define Diseño o Dev. */
  reparto: ParteDelTiempo[];
};

export type ActividadesDelCaso = Omit<CasoGuardado, "actividades"> & {
  actividades: FilaDelCaso[];
  horasPorDefecto: number;
  horasOpcionales: number;
  /** Las horas por defecto cuando se vende junto con su requisito (lo compartido no se cobra dos veces). */
  horasJuntoConSuRequerido: number | null;
};

export interface DatosDeActividades {
  version: string;
  biblioteca: ActividadDeLaBiblioteca[];
  casos: ActividadesDelCaso[];
  preguntasDeLaBiblioteca: PreguntaDeLaBiblioteca[];
}

/**
 * Valida los datos y arma la vista: cada fila con su actividad y cada caso con sus horas. Un JSON mal regenerado (o una
 * fila que apunta a una actividad que no existe) falla aquí con su ruta, no a media pantalla.
 */
export function leerActividades(datos: unknown): DatosDeActividades {
  const g = DatosGuardados.parse(datos);
  const porId = new Map(g.biblioteca.map((a) => [a.id, a]));
  if (porId.size !== g.biblioteca.length) throw new Error("Hay dos actividades con el mismo id en la biblioteca.");
  for (const a of g.biblioteca)
    if (!a.horasPendientes && Math.abs(horasDelReparto(a.partes) - a.horas) > 1e-9)
      throw new Error(`«${a.nombre}»: sus partes suman ${horasDelReparto(a.partes)} h y la actividad dice ${a.horas} h.`);
  const filas = (c: CasoGuardado): FilaDelCaso[] =>
    c.actividades.map((f) => {
      const a = porId.get(f.actividadId);
      if (!a) throw new Error(`${c.id}: la fila «${f.nombre}» apunta a «${f.actividadId}», que no está en la biblioteca.`);
      for (const clave of Object.keys(f.partes ?? {})) {
        const p = a.partes.find((x) => x.clave === clave);
        if (!p?.variable) throw new Error(`${c.id}: la fila «${f.nombre}» cambia la parte «${clave}», que no es variable en «${a.nombre}».`);
      }
      const reparto = a.partes.map((p) => ({ ...p, veces: f.partes?.[p.clave] ?? p.veces }));
      return {
        actividadId: f.actividadId,
        nombre: f.nombre,
        queSeHace: f.queSeHace,
        veces: f.veces,
        porDefecto: f.porDefecto,
        cuandoCambia: f.cuandoCambia,
        sobreQue: f.sobreQue,
        sostiene: f.sostiene,
        siNoVa: f.siNoVa,
        actividad: a.nombre,
        etapa: a.etapa,
        quien: f.quien ?? a.quien,
        horasPorVez: a.horasPendientes ? 0 : horasDelReparto(reparto),
        horasPendientes: a.horasPendientes,
        comparte: a.comparte,
        unidad: a.unidad,
        seRepite: a.seRepite,
        reparto,
      };
    });
  const conFilas = g.casos.map((c) => ({ ...c, actividades: filas(c) }));
  const porCaso = new Map(conFilas.map((c) => [c.id, c]));
  const casos = conFilas.map((c) => {
    const horasPorDefecto = sumarPorDefecto(c);
    const otro = c.requisito ? porCaso.get(c.requisito) : undefined;
    return {
      ...c,
      horasPorDefecto,
      horasOpcionales: c.actividades.filter((f) => !f.porDefecto).reduce((s, f) => s + horasDeLaFila(f), 0),
      horasJuntoConSuRequerido: otro ? horasPorDefecto - horasCompartidas(c.actividades, otro.actividades) : null,
    };
  });
  return { version: g.version, biblioteca: g.biblioteca, casos, preguntasDeLaBiblioteca: g.preguntasDeLaBiblioteca };
}

/** Las horas de un reparto: cada parte por sus veces. */
export function horasDelReparto(partes: readonly Pick<ParteDelTiempo, "horas" | "veces">[]): number {
  return partes.reduce((s, p) => s + p.horas * p.veces, 0);
}

/** De las horas por defecto de un caso, cuántas son sesiones con el cliente y cuántas trabajo interno. */
export function horasConElCliente(caso: Pick<ActividadesDelCaso, "actividades">): { conElCliente: number; internas: number } {
  let conElCliente = 0;
  let internas = 0;
  for (const f of caso.actividades.filter((x) => x.porDefecto))
    for (const p of f.reparto) {
      const h = f.veces * p.horas * p.veces;
      if (p.conElCliente) conElCliente += h;
      else internas += h;
    }
  return { conElCliente, internas };
}

/**
 * Lo que un caso no cobra cuando se vende junto con otro: sus filas marcadas que el otro también trae marcadas y que se
 * comparten (en la venta, o sobre lo mismo), por las veces que coinciden.
 */
export function horasCompartidas(
  filas: readonly Pick<FilaDelCaso, "actividad" | "porDefecto" | "comparte" | "sobreQue" | "veces" | "horasPorVez">[],
  otras: readonly Pick<FilaDelCaso, "actividad" | "porDefecto" | "sobreQue" | "veces">[],
): number {
  let resta = 0;
  for (const f of filas) {
    if (!f.porDefecto || f.comparte === "no") continue;
    // Sin decir sobre qué, la ficha dice «se cobra siempre» (`comoSeCobra`): tampoco se descuenta aquí.
    if (f.comparte === "sobreQue" && !f.sobreQue.trim()) continue;
    const par = otras.find((o) => o.porDefecto && o.actividad === f.actividad && (f.comparte === "venta" || o.sobreQue === f.sobreQue));
    if (par) resta += Math.min(f.veces, par.veces) * f.horasPorVez;
  }
  return resta;
}

export function horasDeLaFila(f: Pick<FilaDelCaso, "veces" | "horasPorVez">): number {
  return f.veces * f.horasPorVez;
}

/** Las horas de las filas marcadas por defecto. Las que define Diseño o Dev cuentan 0 hasta que se definan. */
export function sumarPorDefecto(caso: Pick<ActividadesDelCaso, "actividades">): number {
  return caso.actividades.filter((f) => f.porDefecto).reduce((s, f) => s + horasDeLaFila(f), 0);
}


/**
 * Parte un texto en oraciones, para mostrarlo en viñetas: corta en un punto seguido de espacio y de una mayúscula, «,
 * ¿ o un paréntesis, pero nunca dentro de unas comillas «…» ni de un paréntesis (una cita o un ejemplo pueden traer su
 * propio punto).
 */
export function oraciones(texto: string): string[] {
  const partes: string[] = [];
  let hondo = 0;
  let desde = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === "«" || c === "(") hondo++;
    else if ((c === "»" || c === ")") && hondo > 0) hondo--;
    else if (c === "." && hondo === 0 && texto[i + 1] === " " && /[A-ZÁÉÍÓÚÑ«¿(]/.test(texto[i + 2] ?? "")) {
      partes.push(texto.slice(desde, i + 1).trim());
      desde = i + 2;
    }
  }
  const resto = texto.slice(desde).trim();
  if (resto) partes.push(resto);
  return partes;
}

/** Las filas del caso agrupadas por etapa, en el orden del proyecto. Las etapas sin filas no salen. */
export function filasPorEtapa(caso: Pick<ActividadesDelCaso, "actividades">) {
  return ETAPAS_DE_ACTIVIDAD.map((e) => ({ ...e, filas: caso.actividades.filter((f) => f.etapa === e.clave) })).filter((e) => e.filas.length > 0);
}


/** Las veces y el tiempo de una fila: «1 h», «4 × 1 h», «Lo define Dev». */
export function tiempoDeLaFila(f: Pick<FilaDelCaso, "veces" | "horasPorVez" | "horasPendientes" | "quien">): string {
  if (f.horasPendientes) return f.quien.startsWith("Dev") ? "Lo define Dev" : f.quien.startsWith("Diseño") ? "Lo define Diseño" : "Por definir";
  return f.veces > 1 ? `${f.veces} × ${formatoHoras(f.horasPorVez)}` : formatoHoras(f.horasPorVez);
}

/** Cómo se cobra la fila dentro de una venta, en palabras. */
export function comoSeCobra(f: Pick<FilaDelCaso, "comparte" | "sobreQue">): string {
  if (f.comparte === "venta") return "Una vez en la venta, aunque la traigan varios casos.";
  if (f.comparte === "sobreQue")
    return f.sobreQue
      ? `Una vez en la venta si otro caso la trae sobre lo mismo («${f.sobreQue}»).`
      : "Sin decir sobre qué: se cobra siempre.";
  return "Cada caso cobra la suya.";
}

export interface LineaDeLoQueNoIncluye {
  texto: string;
  /** Las filas que, marcadas todas, quitan la línea: «Importar datos» sobre «negocios». Vacío en la fija. */
  seQuitaCon: string[];
  /** Si la línea vale por un solo camino (Insider o HubSpot). */
  camino?: string;
}

/** «Lo que no incluye» de la venta por defecto, con lo que quita cada línea. La fija vacía no sale. */
export function lineasDeLoQueNoIncluye(caso: Pick<ActividadesDelCaso, "loQueNoIncluye" | "actividades" | "lineasPorCamino">): LineaDeLoQueNoIncluye[] {
  return caso.loQueNoIncluye.flatMap((texto, i) => {
    if (!texto) return [];
    const seQuitaCon =
      i === 0
        ? []
        : [...new Set(caso.actividades.filter((f) => f.siNoVa === i).map((f) => (sobreQueAparte(f) ? `«${f.nombre}» sobre «${f.sobreQue}»` : `«${f.nombre}»`)))];
    const camino = caso.lineasPorCamino.find((x) => x.indice === i)?.camino;
    return [{ texto, seQuitaCon, ...(camino ? { camino } : {}) }];
  });
}

/** «Se quita si se marca «A»» o «Se quita si se marcan «A» y «B»». */
export function textoDeSeQuita(seQuitaCon: string[]): string {
  if (!seQuitaCon.length) return "";
  if (seQuitaCon.length === 1) return `Se quita si se marca ${seQuitaCon[0]}.`;
  return `Se quita si se marcan ${seQuitaCon.slice(0, -1).join(", ")} y ${seQuitaCon[seQuitaCon.length - 1]}.`;
}

/**
 * Lo que necesitamos del cliente en la venta por defecto: lo que pide cada actividad marcada (una vez por actividad)
 * y, después, lo propio del caso, que ninguna actividad pide.
 */
export function loQueSePideAlCliente(
  caso: Pick<ActividadesDelCaso, "actividades" | "loQueNecesitamosDeTi">,
  biblioteca: readonly Pick<ActividadDeLaBiblioteca, "nombre" | "pideAlCliente">[],
): { texto: string; de?: string }[] {
  const pide = new Map(biblioteca.map((a) => [a.nombre, a.pideAlCliente]));
  const marcadas = [...new Set(caso.actividades.filter((f) => f.porDefecto).map((f) => f.actividad))];
  // Un pedido que traen dos actividades (el superadministrador, por ejemplo) sale una sola vez, con la primera.
  const vistos = new Set<string>();
  const deActividades = marcadas.flatMap((nombre) =>
    (pide.get(nombre) ?? []).flatMap((texto) => (vistos.has(texto) ? [] : (vistos.add(texto), [{ texto, de: nombre }]))),
  );
  return [...deActividades, ...caso.loQueNecesitamosDeTi.map((texto) => ({ texto }))];
}

/**
 * Las horas por defecto para la tarjeta del catálogo, sin esconder lo que falta: «13,5 h + Dev por defecto», «34 h el
 * primer trimestre» en un caso recurrente.
 */
export function etiquetaDeHoras(caso: Pick<ActividadesDelCaso, "horasPorDefecto" | "actividades" | "periodo">): string {
  const sinTiempo = [
    ...new Set(
      caso.actividades
        .filter((f) => f.porDefecto && f.horasPendientes)
        .map((f) => (f.quien.startsWith("Dev") ? "Dev" : f.quien.startsWith("Diseño") ? "Diseño" : "lo que falta definir")),
    ),
  ];
  const mas = sinTiempo.length ? ` + ${sinTiempo.join(" y ")}` : "";
  if (!caso.periodo) return `${formatoHoras(caso.horasPorDefecto)}${mas} por defecto`;
  return `${formatoHoras(caso.horasPorDefecto)}${mas} ${/^por trimestre/i.test(caso.periodo) ? "el primer trimestre" : "el primer período"}`;
}

/**
 * «Son casos aparte: las cotizaciones («Cotiza…») y las secuencias («Prospecta…»).» Los que comparten palabras van
 * juntos, unidos por «o». En una venta, Nexus la arma solo con los casos que no van en ella; en la ficha, con todos.
 */
export function lineaDeCasosAparte(casosAparte: ActividadesDelCaso["casosAparte"], tituloDe: (id: string) => string | undefined): string {
  const grupos = new Map<string, string[]>();
  for (const c of casosAparte) {
    const t = tituloDe(c.id);
    if (!t) continue;
    grupos.set(c.palabras, [...(grupos.get(c.palabras) ?? []), `«${t}»`]);
  }
  const partes = [...grupos].map(([palabras, titulos]) => `${palabras} (${titulos.join(" o ")})`);
  if (!partes.length) return "";
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  return `Son casos aparte: ${lista}.`;
}
