/**
 * lib/memoria/armar.ts — EL ARMADOR DE LA MEMORIA. PURO.
 *
 * Recibe lo que el cargador ya leyó (lib/memoria/cargar.ts) y arma el bloque para el prompt según el alcance. La regla
 * que más importa —que algo interno no llegue a un documento del cliente— vive acá, en una sola función por memoria, y
 * se prueba sin base (armar.test.ts y frontera.test.ts):
 *
 *   · `cliente`: la ficha confirmada (sin campos internos ni la postura), los procesos validados, la historia sin ids
 *     de trato; del proyecto, de las reuniones CON EL CLIENTE solo los acuerdos y las decisiones de su minuta (sin
 *     riesgos ni montos), las desviaciones que el cliente ve, sin quién las causó, y los resultados confirmados.
 *   · `sin-lo-interno` (el handoff): lo de arriba más lo propuesto de la ficha con su fuente, los procesos sin validar y
 *     los resultados sin confirmar. Nada interno.
 *   · `interno`: todo, más lo fuera de alcance, lo aprendido en la preventa, la auditoría del portal y los compromisos
 *     abiertos.
 *
 * Nunca llega acá (ni en el alcance interno): facturación, montos de Partner, rentabilidad, salarios, el monto de un
 * pedido, la cita de una tarea ni el `sourceQuote` de una desviación. No están en los tipos (lib/memoria/tipos.ts).
 * Sin nada que decir devuelve "": un bloque vacío no se manda.
 */
import { CAMPOS_DE_LA_FICHA, etiquetaDeApertura, fichaParaLaMemoria, stakeholdersSinPostura, type FichaGuardada } from "@/lib/clients/ficha";
import { fronteraDeLaPieza } from "@/lib/contexto/frontera-de-los-documentos";
import { traeNegociacion, traeUnMonto } from "@/lib/contexto/frontera-del-cronograma";
import { resultadosParaPrompt, sinConfirmar } from "@/lib/handoff/resultados-medibles";
import type { MapaDeProceso } from "@/lib/procesos/mapa";
import { prefijoDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { ESTADOS_ABIERTOS, estadoDeSolicitud, rotuloDeSolicitud } from "@/lib/sessions/solicitudes-fuera-de-alcance";
import { ROTULO_DEL_TEMA, ROTULO_DEL_TIPO } from "@/lib/seguimiento/hechos/tipos";
import { queCargar } from "./consumidores";
import type {
  AlcanceDeMemoria,
  ClaveDeParte,
  CompromisoDeLaMemoria,
  DatosDeLaCuenta,
  DatosDelProyecto,
  HechoDeLaMemoria,
  MemoriaArmada,
  MinutaDeLaMemoria,
  ParteDeLaMemoria,
  PedidoDeLaMemoria,
  ProcesoDeLaMemoria,
  QueCargar,
  SeccionDeLoEsencial,
} from "./tipos";

/** El rótulo fijo del bloque: lo que dice que esto no son las reuniones del documento. */
export const ROTULO_DE_LA_MEMORIA =
  "LO QUE NEXUS YA SABE (memoria): no son reuniones de este documento; lo propuesto no está confirmado";

/** Los topes, en caracteres. Cada parte tiene el suyo y su suma no pasa del total. */
export const TOPES_DE_LA_MEMORIA = {
  // + `partes.hechos` en cada uno (memoria de la cuenta, etapa 6): los hechos solo existen en el alcance interno.
  cuenta: 6900,
  proyecto: 8900,
  partes: {
    ficha: 2000,
    procesos: 800,
    historia: 600,
    fueraDeAlcance: 600,
    auditoria: 500,
    preventa: 1500,
    minutas: 4500,
    compromisos: 1200,
    desviaciones: 1000,
    resultados: 1300,
    hechos: 900,
  } satisfies Record<ClaveDeParte, number>,
  /** Cuántas reuniones del proyecto, como mucho (las más nuevas con contenido). */
  reuniones: 8,
  /** Cuánto de cada reunión. */
  porReunion: 560,
  procesos: 8,
  proyectos: 10,
  pedidos: 10,
  hallazgos: 8,
  compromisos: 12,
  desviaciones: 8,
  hechos: 12,
} as const;

const TITULOS: Record<ClaveDeParte, string> = {
  ficha: "Información del cliente",
  procesos: "Procesos de la cuenta",
  historia: "Historia con Smarteam",
  fueraDeAlcance: "Pedidos fuera de alcance (INTERNO)",
  preventa: "Lo aprendido en la preventa (INTERNO)",
  auditoria: "Auditoría del portal (INTERNO)",
  minutas: "Lo que dejaron las reuniones del proyecto",
  compromisos: "Compromisos abiertos (INTERNO)",
  desviaciones: "Desviaciones del plan",
  resultados: "Resultados que persigue el proyecto",
  hechos: "Hechos de las reuniones (INTERNO)",
};

/** Las partes que solo existen en el alcance interno. */
const SOLO_INTERNAS: ReadonlySet<ClaveDeParte> = new Set(["fueraDeAlcance", "preventa", "auditoria", "compromisos", "hechos"]);

/**
 * La IA como borrador (2026-10-15): lo que escribió la IA se usa desde el primer momento, pero lo que confirmó una
 * persona manda. Va en el encabezado de toda memoria.
 */
export const LO_CONFIRMADO_MANDA =
  "Lo marcado «borrador» lo escribió la IA y nadie lo revisó: úsalo, pero si contradice algo confirmado (la ficha " +
  "confirmada, una minuta revisada), vale lo confirmado.";

const LINEA_DEL_ALCANCE: Record<AlcanceDeMemoria, string> = {
  cliente: "⛔ Va a un documento que lee el cliente: úsalo sin decir de dónde salió cada cosa.",
  "sin-lo-interno": "No trae nada interno. Lo propuesto úsalo solo si tus fuentes lo confirman.",
  interno: "Lo marcado INTERNO nunca se cita al cliente.",
};

/**
 * La regla de la frontera para el handoff (`sin-lo-interno`): es interno, pero en la misma llamada escribe lo que leen
 * el kickoff y el cuestionario del cliente. Para un documento del cliente va la de la pieza (`fronteraDeLaPieza`), la
 * misma que viaja dentro del bloque de reuniones y del de notas (lib/contexto/material-del-documento.ts).
 */
export const FRONTERA_DE_LA_MEMORIA_DEL_HANDOFF =
  "⛔ Lo que escribas de acá puede llegar a lo que lee el cliente (el kickoff, el cuestionario): nunca pases precios, " +
  "montos, descuentos ni condiciones de lo que cobra Smarteam, ni opiniones internas sobre personas. Lo dicho " +
  "[PUERTAS ADENTRO] es de Smarteam y nunca se le atribuye al cliente.";

/** La regla de la frontera del bloque, según para quién es. El alcance interno no la lleva: nada de ahí llega al cliente. */
export function fronteraDeLaMemoria(alcance: AlcanceDeMemoria, pieza: string | null | undefined): string {
  if (alcance === "interno") return "";
  if (alcance === "sin-lo-interno") return FRONTERA_DE_LA_MEMORIA_DEL_HANDOFF;
  // Sin pieza (el correo) o con una que no está en el registro, la regla completa: lo estricto no le muestra nada a nadie.
  return fronteraDeLaPieza(pieza ?? "");
}

// ── Ayudantes ────────────────────────────────────────────────────────────────────────────────

const MARCA_DE_RECORTE = "\n(…recortado)";

/** Recorta en el último salto de línea antes del tope (o a secas si no hay uno razonable) y lo dice. */
export function recortarAlTope(texto: string, tope: number): string {
  const t = texto.trim();
  if (t.length <= tope) return t;
  const espacio = Math.max(0, tope - MARCA_DE_RECORTE.length);
  const corte = t.lastIndexOf("\n", espacio);
  const hasta = corte > espacio * 0.5 ? corte : espacio;
  return `${t.slice(0, hasta).trimEnd()}${MARCA_DE_RECORTE}`;
}

/** El día de Costa Rica (UTC-6, sin horario de verano) de un instante, AAAA-MM-DD. */
export function diaDeCostaRica(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso.slice(0, 10);
  return new Date(ms - 6 * 3_600_000).toISOString().slice(0, 10);
}

interface ParteArmada {
  clave: ClaveDeParte;
  cuerpo: string;
}

/** Junta las partes con su título, sin pasar del total. Lo que no entra se recorta (o queda afuera) y se dice. */
function juntar(encabezado: string, partes: readonly ParteArmada[], tope: number): MemoriaArmada {
  const conTexto = partes.filter((p) => p.cuerpo.trim());
  if (!conTexto.length) return { texto: "", partes: [] };
  const salida: string[] = [encabezado];
  const metadatos: ParteDeLaMemoria[] = [];
  let usados = 0;
  for (const p of conTexto) {
    const bloque = `## ${TITULOS[p.clave]}\n${p.cuerpo.trim()}`;
    const queda = tope - usados;
    if (queda < 200) break;
    const final = bloque.length <= queda ? bloque : recortarAlTope(bloque, queda);
    salida.push(final);
    metadatos.push({ clave: p.clave, titulo: TITULOS[p.clave], caracteres: final.length, interno: SOLO_INTERNAS.has(p.clave) });
    usados += final.length;
  }
  return { texto: salida.join("\n\n"), partes: metadatos };
}

/** El encabezado del bloque: el rótulo, de quién es y, fuera del alcance interno, la regla de la frontera ADENTRO. */
function encabezado(alcance: AlcanceDeMemoria, de: string, pieza: string | null | undefined): string {
  const frontera = fronteraDeLaMemoria(alcance, pieza);
  return `=== ${ROTULO_DE_LA_MEMORIA} ===\n${de} ${LINEA_DEL_ALCANCE[alcance]}\n${LO_CONFIRMADO_MANDA}${frontera ? `\n${frontera}` : ""}`;
}

// ── La memoria de la cuenta ──────────────────────────────────────────────────────────────────

/** Un mapa nuevo, resumido para la memoria: nombre, estado, qué resuelve y hasta 3 dolores de hoy. */
export function resumirMapa(m: MapaDeProceso): ProcesoDeLaMemoria {
  return {
    nombre: m.nombre,
    estado: m.estado,
    queResuelve: (m.queResuelve ?? "").trim(),
    dolores: m.hoy.pasos
      .map((p) => (p.dolor ?? "").trim())
      .filter(Boolean)
      .slice(0, 3),
  };
}

const ESTADO_DEL_PROCESO: Record<ProcesoDeLaMemoria["estado"], string> = {
  validado: " (validado con el cliente)",
  revisado: " (revisado por Smarteam; el cliente todavía no lo validó)",
  borrador: " (borrador del agente; el cliente todavía no lo validó)",
  anterior: " (formato anterior; sin validar)",
};

function parteDeProcesos(procesos: readonly ProcesoDeLaMemoria[], q: QueCargar): string {
  return procesos
    .filter((p) => q.procesosSinValidar || p.estado === "validado")
    .slice(0, TOPES_DE_LA_MEMORIA.procesos)
    .map((p) => {
      const linea = `- ${p.nombre}${ESTADO_DEL_PROCESO[p.estado]}${p.queResuelve ? `: ${p.queResuelve}` : ""}`;
      return [linea, ...p.dolores.map((d) => `  ⚠ Dolor de hoy: ${d}`)].join("\n");
    })
    .join("\n");
}

const ESTADO_DEL_PROYECTO: Record<string, string> = { active: "en curso", paused: "en pausa", completed: "terminado" };

function parteDeHistoria(datos: DatosDeLaCuenta, q: QueCargar, proyectoActualId: string | null): string {
  const proyectos = datos.proyectos.slice(0, TOPES_DE_LA_MEMORIA.proyectos);
  const otros = proyectos.filter((p) => p.id !== proyectoActualId);
  if (!otros.length && !datos.entrega) return "";
  const lineas = proyectos.map((p) => {
    const partes = [
      `- ${p.nombre}${p.tipo ? ` (${p.tipo})` : ""}`,
      ESTADO_DEL_PROYECTO[p.estado] ?? p.estado,
      `desde ${diaDeCostaRica(p.desde)}`,
      ...(q.idsDeTrato && p.tratoId ? [`trato ${p.tratoId}`] : []),
      ...(p.id === proyectoActualId ? ["este proyecto"] : []),
    ];
    return partes.join(" · ");
  });
  if (datos.entrega?.texto.trim()) {
    lineas.push(`Lo que se entregó en «${datos.entrega.proyecto}» (entrega publicada al cliente):\n${datos.entrega.texto.trim()}`);
  }
  return lineas.join("\n");
}

function parteDeFueraDeAlcance(datos: DatosDeLaCuenta): string {
  return datos.fueraDeAlcance
    .slice(0, TOPES_DE_LA_MEMORIA.pedidos)
    .map(
      (p) =>
        `- [${rotuloDeSolicitud(p.estado)}] ${p.pedido.trim()}` +
        `${p.proyecto ? ` · ${p.proyecto}` : ""}${p.quienLoPidio ? ` · lo pidió ${p.quienLoPidio}` : ""} · ${diaDeCostaRica(p.fecha)}`,
    )
    .join("\n");
}

function parteDePreventa(datos: DatosDeLaCuenta): string {
  const p = datos.preventa;
  if (!p?.texto.trim()) return "";
  return `Preventa ${p.archivada ? "archivada" : "abierta"}, con actividad hasta el ${diaDeCostaRica(p.fecha)}. Es lo que se estimó en la venta, no evidencia.\n${p.texto.trim()}`;
}

function parteDeAuditoria(datos: DatosDeLaCuenta): string {
  const a = datos.auditoria;
  if (!a || (!a.hallazgos.length && !a.estado)) return "";
  const lineas = [`«${a.nombre}» (${diaDeCostaRica(a.fecha)}). Solo lo que una persona confirmó.`];
  if (a.estado) lineas.push(`Estado del portal: ${a.estado}`);
  for (const h of a.hallazgos.slice(0, TOPES_DE_LA_MEMORIA.hallazgos)) {
    lineas.push(`- [${h.seccion}] ${h.titulo}: ${h.hallazgo}${h.decision ? ` → ${h.decision}` : ""}`);
  }
  return lineas.join("\n");
}

/**
 * Los hechos de las reuniones (memoria de la cuenta, etapa 6), solo para el alcance interno: los usados tal cual, y los
 * pendientes rotulados «propuesto por la lectura de «X» del <fecha>, sin revisar». Sin la cita: la frase alcanza.
 */
export function parteDeHechos(hechos: readonly HechoDeLaMemoria[]): string {
  return hechos
    .slice(0, TOPES_DE_LA_MEMORIA.hechos)
    .map((h) => {
      const tipo = ROTULO_DEL_TIPO[h.tipo as keyof typeof ROTULO_DEL_TIPO] ?? h.tipo;
      const tema = h.tema ? ` · ${ROTULO_DEL_TEMA[h.tema as keyof typeof ROTULO_DEL_TEMA] ?? h.tema}` : "";
      const base = `- ${tipo}${tema}: ${h.frase.trim()}`;
      if (h.estado === "usado") return base;
      const de = h.reunion ? `la lectura de «${h.reunion.titulo}» del ${h.reunion.fecha}` : "la lectura de una reunión";
      return `${base} (propuesto por ${de}, sin revisar)`;
    })
    .join("\n");
}

export interface OpcionesDeLaCuenta {
  alcance: AlcanceDeMemoria;
  /** Los orígenes de la ficha que este lector no lee como propuesta (los suyos). */
  excluirOrigenes?: readonly string[];
  /** Partes que el lector ya tiene por otro lado. */
  sinPartes?: readonly ClaveDeParte[];
  /** El proyecto desde el que se lee, si hay: se marca en la historia y su propia entrega no cuenta. */
  proyectoActualId?: string | null;
  /** La pieza del lector (lib/memoria/consumidores.ts): decide la regla de la frontera que va en el encabezado. */
  pieza?: string | null;
}

export function armarMemoriaDeLaCuenta(datos: DatosDeLaCuenta, opts: OpcionesDeLaCuenta): MemoriaArmada {
  const q = queCargar(opts.alcance);
  const sin = new Set(opts.sinPartes ?? []);
  const T = TOPES_DE_LA_MEMORIA.partes;
  const todas: ParteArmada[] = [
    {
      clave: "ficha",
      cuerpo: recortarAlTope(
        fichaParaLaMemoria(q.fichaPropuesta ? datos.ficha : { ...datos.ficha, propuesta: null }, {
          alcance: opts.alcance,
          excluirOrigenes: opts.excluirOrigenes ?? [],
        }),
        T.ficha,
      ),
    },
    { clave: "procesos", cuerpo: recortarAlTope(parteDeProcesos(datos.procesos, q), T.procesos) },
    { clave: "historia", cuerpo: recortarAlTope(parteDeHistoria(datos, q, opts.proyectoActualId ?? null), T.historia) },
    { clave: "fueraDeAlcance", cuerpo: q.fueraDeAlcance ? recortarAlTope(parteDeFueraDeAlcance(datos), T.fueraDeAlcance) : "" },
    { clave: "auditoria", cuerpo: q.auditoria ? recortarAlTope(parteDeAuditoria(datos), T.auditoria) : "" },
    { clave: "preventa", cuerpo: q.preventa ? recortarAlTope(parteDePreventa(datos), T.preventa) : "" },
    { clave: "hechos", cuerpo: q.hechos ? recortarAlTope(parteDeHechos(datos.hechos ?? []), T.hechos) : "" },
  ];
  const partes = todas.filter((p) => !sin.has(p.clave));
  return juntar(encabezado(opts.alcance, `De la cuenta «${datos.cliente.nombre}».`, opts.pieza), partes, TOPES_DE_LA_MEMORIA.cuenta);
}

// ── La memoria del proyecto ──────────────────────────────────────────────────────────────────

/* La negociación sin cifra vive junto a `traeUnMonto` (lib/contexto/frontera-del-cronograma.ts): la usan también los
   documentos del cliente con la minuta en borrador (lib/contexto/material-del-documento.ts). Se re-exporta acá. */
export { traeNegociacion };

/**
 * De una minuta, solo las decisiones y los acuerdos. Con `sinMontos` (lo que va a un documento del cliente o al
 * handoff) se quedan afuera los que traen un monto o hablan de negociación (`traeNegociacion`): ahí suelen estar los
 * precios y las condiciones de Smarteam. Es la red: la regla va en el encabezado (`fronteraDeLaMemoria`).
 */
export function acuerdosYDecisiones(m: MinutaDeLaMemoria | null, opts: { sinMontos: boolean } = { sinMontos: true }): string {
  if (!m) return "";
  return [...m.decisiones.map((d) => `- Decisión: ${d.trim()}`), ...m.acuerdos.map((a) => `- Acuerdo: ${a.trim()}`)]
    .filter((l) => !opts.sinMontos || (!traeUnMonto(l) && !traeNegociacion(l)))
    .join("\n");
}

function minutaEntera(m: MinutaDeLaMemoria): string {
  const partes: string[] = [];
  if (m.resumen?.trim()) partes.push(m.resumen.trim());
  const decisiones = acuerdosYDecisiones(m, { sinMontos: false });
  if (decisiones) partes.push(decisiones);
  if (m.riesgos.length) partes.push(m.riesgos.map((r) => `- Riesgo: ${r.trim()}`).join("\n"));
  return partes.join("\n");
}

function parteDeMinutas(datos: DatosDelProyecto, q: QueCargar, yaLeidas: ReadonlySet<string>): string {
  const bloques: string[] = [];
  for (const r of datos.reuniones) {
    if (bloques.length >= TOPES_DE_LA_MEMORIA.reuniones) break;
    if (yaLeidas.has(r.id)) continue;
    if (!q.reunionesPuertasAdentro && r.sala !== "CON EL CLIENTE") continue;
    // Una minuta que nadie revisó llega como borrador (la IA como borrador, 2026-10-15): marcada, y fuera del alcance
    // interno solo con sus acuerdos y decisiones, sin montos ni negociación (`acuerdosYDecisiones`).
    if (!q.minutasSinRevisar && !r.minuta?.revisada) continue;
    const borrador = r.minuta && !r.minuta.revisada ? " (minuta en borrador, sin revisar)" : "";
    const cuerpo = q.minutaCompleta ? r.resumen.trim() || (r.minuta ? minutaEntera(r.minuta) : "") : acuerdosYDecisiones(r.minuta);
    if (!cuerpo.trim()) continue;
    bloques.push(`#### ${diaDeCostaRica(r.fecha)} · ${prefijoDeSala(r.sala)}${r.titulo}${borrador}\n${recortarAlTope(cuerpo, TOPES_DE_LA_MEMORIA.porReunion)}`);
  }
  return bloques.join("\n\n");
}

function parteDeCompromisos(datos: DatosDelProyecto): string {
  return datos.compromisos
    .slice(0, TOPES_DE_LA_MEMORIA.compromisos)
    .map(
      (c) =>
        `- ${c.venceEl ? `[vence ${c.venceEl}] ` : ""}${c.titulo} (${c.lado === "cliente" ? "lo prometió el cliente" : "de Smarteam"} · ${c.estado})`,
    )
    .join("\n");
}

/** En palabras del cliente (GLOSSARY, vocabulario interno → cliente). */
const TIPO_DE_DESVIACION: Record<string, string> = { ATRASO: "Se atrasó", COMPROMISO: "Acordado", SOLICITUD: "En espera" };

function parteDeDesviaciones(datos: DatosDelProyecto, q: QueCargar): string {
  return datos.desviaciones
    .filter((d) => q.desviacionesNoVisibles || (d.visibleAlCliente && !d.sinConfirmar))
    .slice(0, TOPES_DE_LA_MEMORIA.desviaciones)
    .map((d) => {
      const semanas = d.semanas ? ` (${d.semanas} ${d.semanas === 1 ? "semana" : "semanas"})` : "";
      let linea = `- ${diaDeCostaRica(d.fecha)} · ${TIPO_DE_DESVIACION[d.tipo] ?? d.tipo}: ${d.titulo.trim()}${semanas}`;
      if (q.atribucionDeDesviaciones) {
        const marcas = [`la causó: ${d.quien}`, ...(d.sinConfirmar ? ["propuesta del agente, sin confirmar"] : []), ...(d.cerrada ? ["cerrada"] : []), ...(!d.visibleAlCliente ? ["el cliente no la ve"] : [])];
        linea += ` [${marcas.join(" · ")}]`;
        if (d.detalle?.trim()) linea += `\n  ${recortarAlTope(d.detalle, 240).replace(/\n/g, " ")}`;
      }
      return linea;
    })
    .join("\n");
}

function parteDeResultados(datos: DatosDelProyecto, q: QueCargar): string {
  const lista = q.resultadosSinConfirmar ? datos.resultados : datos.resultados.filter((r) => !sinConfirmar(r));
  return resultadosParaPrompt(lista);
}

export interface OpcionesDelProyecto {
  alcance: AlcanceDeMemoria;
  /** Las reuniones que el lector ya lee en su material: no se repiten acá. */
  yaLeidas?: readonly string[];
  sinPartes?: readonly ClaveDeParte[];
  /** La pieza del lector: decide la regla de la frontera que va en el encabezado. */
  pieza?: string | null;
}

export function armarMemoriaDelProyecto(datos: DatosDelProyecto, opts: OpcionesDelProyecto): MemoriaArmada {
  const q = queCargar(opts.alcance);
  const sin = new Set(opts.sinPartes ?? []);
  const T = TOPES_DE_LA_MEMORIA.partes;
  const todas: ParteArmada[] = [
    { clave: "minutas", cuerpo: recortarAlTope(parteDeMinutas(datos, q, new Set(opts.yaLeidas ?? [])), T.minutas) },
    { clave: "compromisos", cuerpo: q.compromisos ? recortarAlTope(parteDeCompromisos(datos), T.compromisos) : "" },
    { clave: "desviaciones", cuerpo: recortarAlTope(parteDeDesviaciones(datos, q), T.desviaciones) },
    { clave: "resultados", cuerpo: recortarAlTope(parteDeResultados(datos, q), T.resultados) },
    { clave: "hechos", cuerpo: q.hechos ? recortarAlTope(parteDeHechos(datos.hechos ?? []), T.hechos) : "" },
  ];
  const partes = todas.filter((p) => !sin.has(p.clave));
  return juntar(encabezado(opts.alcance, `Del proyecto «${datos.proyecto.nombre}».`, opts.pieza), partes, TOPES_DE_LA_MEMORIA.proyecto);
}

// ── Lo esencial de la cuenta (el pase de cuenta) ─────────────────────────────────────────────

/** Una línea corta: la primera con texto, sin la viñeta, recortada. */
function enUnaLinea(texto: string, tope = 140): string {
  const linea =
    texto
      .split("\n")
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
      .find(Boolean) ?? "";
  return linea.length > tope ? `${linea.slice(0, tope - 1).trimEnd()}…` : linea;
}

/**
 * LO ESENCIAL DE LA CUENTA, en líneas cortas (para un aviso, no para un prompt): la ficha confirmada (una línea por
 * campo), las personas, los compromisos abiertos y lo fuera de alcance abierto. Lo usa el pase de cuenta: el CSE nuevo
 * lo recibe en «Para ti». Con el alcance interno van los campos internos, la postura, los compromisos y los pedidos;
 * con cualquier otro, nada de eso. Las secciones vacías no van.
 */
export function armarLoEsencial(
  datos: { ficha: FichaGuardada; compromisos: readonly (CompromisoDeLaMemoria & { proyecto?: string })[]; pedidos: readonly PedidoDeLaMemoria[] },
  alcance: AlcanceDeMemoria,
): SeccionDeLoEsencial[] {
  const q = queCargar(alcance);
  const interno = alcance === "interno";
  const ficha = CAMPOS_DE_LA_FICHA.filter((c) => c.clave !== "stakeholders" && (q.camposInternos || c.alCliente))
    .map((c) => {
      const bruto = datos.ficha.valores[c.clave].trim();
      if (!bruto || bruto === "sin_evaluar") return "";
      const valor = c.destino.tipo === "lista" ? etiquetaDeApertura(bruto) : enUnaLinea(bruto);
      return valor ? `${c.etiqueta}${!c.alCliente ? " (interno)" : ""}: ${valor}` : "";
    })
    .filter(Boolean)
    .slice(0, 6);
  const stakeholders = datos.ficha.valores.stakeholders;
  const personas = (q.posturaDeLasPersonas ? stakeholders : stakeholdersSinPostura(stakeholders))
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const compromisos = q.compromisos
    ? datos.compromisos
        .slice(0, 6)
        .map(
          (c) =>
            `${c.titulo}${c.venceEl ? ` (vence ${c.venceEl})` : ""} · ${c.lado === "cliente" ? "lo prometió el cliente" : "de Smarteam"}${c.proyecto ? ` · ${c.proyecto}` : ""}`,
        )
    : [];
  const pedidos = q.fueraDeAlcance
    ? datos.pedidos
        .filter((p) => ESTADOS_ABIERTOS.includes(estadoDeSolicitud(p.estado)))
        .slice(0, 5)
        .map((p) => `[${rotuloDeSolicitud(p.estado)}] ${enUnaLinea(p.pedido)}`)
    : [];
  const secciones: SeccionDeLoEsencial[] = [
    { clave: "ficha", titulo: interno ? "Información del cliente (confirmada)" : "Información del cliente", lineas: ficha },
    { clave: "personas", titulo: "Las personas", lineas: personas },
    { clave: "compromisos", titulo: "Compromisos abiertos", lineas: compromisos },
    { clave: "pedidos", titulo: "Pedidos fuera de alcance abiertos", lineas: pedidos },
  ];
  return secciones.filter((s) => s.lineas.length > 0);
}
