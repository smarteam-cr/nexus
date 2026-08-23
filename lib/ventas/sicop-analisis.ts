/**
 * lib/ventas/sicop-analisis.ts — LA CORRIDA: quién se re-lee, quién no, y qué se guarda.
 *
 * Es la bisagra entre el lector de HubSpot (`sicop.ts`), el intérprete (`sicop-lectura.ts`) y
 * la tabla `SicopLectura`. Lo único que decide de verdad es UNA cosa: **a quién hay que
 * volver a leer**. Todo lo demás es plomería.
 *
 * ⚠ ESA DECISIÓN ES PLATA. Re-analizar las 45 licitaciones en cada corrida cuesta 45 llamadas
 * a Claude; re-analizar solo lo que cambió cuesta las que de verdad se movieron (hoy, en un
 * día normal, 3). La huella (`fuenteSha`) se calcula sobre el TEXTO LEÍDO —título, descripción
 * y notas— y no sobre el ticket: mover una tarjeta de etapa o cambiar el responsable NO
 * invalida nada, porque no cambia una coma de lo que hay para interpretar.
 *
 * ⚠ LA TABLA PUEDE NO EXISTIR TODAVÍA. El .sql lo aplica Elías después del deploy, así que
 * entre una cosa y la otra hay una ventana en la que `SicopLectura` no está. Se detecta y se
 * reporta como `esquemaAtrasado` en vez de reventar la pantalla entera: una sección que devuelve
 * 500 durante media hora se lee como "el módulo está roto", no como "falta correr un script".
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import {
  leerNotasDeTickets,
  leerTableroSicop,
  type LicitacionSicop,
  type NotaCruda,
  type TableroSicop,
} from "./sicop";
import {
  adjuntosPorLeer,
  extraerAdjunto,
  leerTextoDeAdjuntos,
  sincronizarAdjuntos,
} from "./sicop-archivos";
import {
  construirFuente,
  leerLicitacionConIA,
  normalizarBloqueantes,
  normalizarPlazos,
  type NotaDeTicket,
  type TicketParaLeer,
} from "./sicop-lectura";
import type { EncajeSicop, LecturaSicop } from "./sicop-orden";

/** Cuántas licitaciones se leen a la vez. HubSpot no interviene acá; el límite es Claude. */
const EN_PARALELO = 6;

/** Tope por corrida. Existe para que un pipeline que crezca a 500 no se lea entero de un saque. */
export const MAX_POR_CORRIDA = 50;

// ── Lectura de lo ya guardado ──────────────────────────────────────────────────

export interface LecturasGuardadas {
  /** ticketId → lo que se guardó la última vez. */
  porTicket: Map<string, { lectura: LecturaSicop; fuenteSha: string }>;
  /**
   * true = la base está ATRÁS del código: falta aplicar un `.sql` de `scripts/sql/`. Cubre
   * tanto la tabla ausente como una COLUMNA ausente — el 2026-08-23 la pantalla reventó por
   * lo segundo mientras la guarda solo miraba lo primero.
   */
  esquemaAtrasado: boolean;
}

type FilaGuardada = {
  hubspotTicketId: string;
  fuenteSha: string;
  notasLeidas: number;
  adjuntosSinLeer: number;
  adjuntosLeidos: number;
  profundo: boolean;
  fuenteTruncada: boolean;
  objeto: string | null;
  institucion: string | null;
  categorias: string[];
  encaje: string;
  encajeRazon: string | null;
  puntajeEncaje: number | null;
  probabilidad: number | null;
  probabilidadRazon: string | null;
  bloqueantes: Prisma.JsonValue | null;
  evaluacion: string | null;
  pesoPrecio: number | null;
  entregables: string | null;
  plazos: Prisma.JsonValue | null;
  monto: Prisma.Decimal | null;
  moneda: string | null;
  confianza: number | null;
  modelo: string | null;
  analizadoEl: Date;
  error: string | null;
};

function aLectura(f: FilaGuardada): LecturaSicop {
  return {
    objeto: f.objeto,
    institucion: f.institucion,
    categorias: f.categorias,
    encaje: f.encaje as EncajeSicop,
    encajeRazon: f.encajeRazon,
    puntajeEncaje: f.puntajeEncaje,
    probabilidad: f.probabilidad,
    probabilidadRazon: f.probabilidadRazon,
    /* Se re-normaliza al SALIR de la base y no se castea: una columna JSON escrita por una
       versión anterior del prompt puede tener otra forma, y un `as` es una promesa que nadie
       verifica — la pantalla se enteraría pintando `undefined.titulo`. */
    bloqueantes: normalizarBloqueantes(f.bloqueantes),
    evaluacion: f.evaluacion,
    pesoPrecio: f.pesoPrecio,
    entregables: f.entregables,
    plazos: normalizarPlazos(f.plazos),
    // Decimal → number en el borde: un Decimal de Prisma no sobrevive el salto al cliente.
    monto: f.monto == null ? null : Number(f.monto),
    moneda: f.moneda === "CRC" || f.moneda === "USD" ? f.moneda : null,
    confianza: f.confianza,
    notasLeidas: f.notasLeidas,
    adjuntosSinLeer: f.adjuntosSinLeer,
    profundo: f.profundo,
    adjuntosLeidos: f.adjuntosLeidos,
    fuenteTruncada: f.fuenteTruncada,
    analizadoEl: f.analizadoEl.toISOString(),
    modelo: f.modelo,
    error: f.error,
  };
}

export async function leerLecturasGuardadas(
  ticketIds: readonly string[],
): Promise<LecturasGuardadas> {
  const porTicket = new Map<string, { lectura: LecturaSicop; fuenteSha: string }>();
  if (ticketIds.length === 0) return { porTicket, esquemaAtrasado: false };
  try {
    const filas = await prisma.sicopLectura.findMany({
      where: { hubspotTicketId: { in: [...ticketIds] } },
    });
    for (const f of filas) {
      porTicket.set(f.hubspotTicketId, {
        lectura: aLectura(f as FilaGuardada),
        fuenteSha: f.fuenteSha,
      });
    }
    return { porTicket, esquemaAtrasado: false };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { porTicket, esquemaAtrasado: true };
    throw e;
  }
}

// ── La corrida ─────────────────────────────────────────────────────────────────

export interface ResultadoDeCorrida {
  /** Cuántas licitaciones se leyeron con IA en esta corrida. */
  analizadas: number;
  /** Cuántas se saltearon porque su huella no cambió. */
  intactas: number;
  /** De las analizadas, cuántas volvieron con error. */
  fallidas: number;
  /** Cuántas quedaron sin leer por el tope de la corrida. */
  pendientes: number;
  total: number;
  esquemaAtrasado: boolean;
  /** Mensaje corto cuando ni siquiera se pudo llegar a HubSpot. */
  error: string | null;
  /** Lo que pasó con los archivos. Los tres desenlaces tienen dueños distintos. */
  archivos: {
    /** Filas creadas: archivos que Nexus no conocía. */
    nuevos: number;
    /** Bajados y convertidos en texto. */
    leidos: number;
    /** Se bajaron y no dieron texto — cartel escaneado, haría falta OCR. */
    sinTexto: number;
    /** 403: falta el scope `files` en la app de HubSpot. */
    sinPermiso: number;
    fallidos: number;
    /** true = falta correr `scripts/sql/2026-08-23-sicop-adjuntos.sql`. */
    esquemaAtrasado: boolean;
  };
}

/** Corre `tarea` sobre `items` con un tope de concurrencia, en orden de llegada. */
async function enParalelo<T>(
  items: readonly T[],
  tope: number,
  tarea: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const obreros = Array.from({ length: Math.min(tope, items.length) }, async () => {
    while (i < items.length) {
      const mio = items[i++];
      await tarea(mio);
    }
  });
  await Promise.all(obreros);
}

function aTicketParaLeer(
  l: LicitacionSicop,
  notas: NotaDeTicket[],
  adjuntos: { nombre: string; texto: string }[] = [],
): TicketParaLeer {
  return {
    id: l.id,
    asunto: l.asunto,
    contenido: l.detalle,
    procedimiento: l.procedimiento,
    tipoContratacion: l.tipoContratacion,
    formatoEvaluacion: l.formatoEvaluacion,
    fechaAclaraciones: l.fechaAclaraciones,
    presupuestoCrm: l.presupuesto,
    notas,
    adjuntos,
  };
}

export interface OpcionesDeCorrida {
  /** Analiza SOLO estas licitaciones (lo que marcó el usuario en la tabla). Vacío = todas. */
  ticketIds?: readonly string[];
  /** Re-lee aunque la huella no haya cambiado — para después de tocar el criterio. */
  forzar?: boolean;
  /**
   * A FONDO: baja los archivos, les saca el texto y se lo pasa al modelo.
   *
   * ⚠ Es lo que cuesta plata de verdad (~US$0,09 contra ~US$0,018) y por eso lo dispara una
   * persona sobre lo que eligió, no una corrida automática sobre las 45.
   */
  profundo?: boolean;
}

/**
 * Lee de HubSpot, decide a quién re-analizar y guarda. Nunca tira.
 *
 * ⚠ El orden de lectura es DELIBERADO: primero lo que está en juego (etapas abiertas) y
 * dentro de eso lo más recientemente movido. Si el tope de la corrida corta, corta por el
 * cementerio y no por la licitación que vence el viernes.
 */
export async function correrAnalisisSicop(
  opciones: OpcionesDeCorrida = {},
): Promise<ResultadoDeCorrida> {
  const sinArchivos = {
    nuevos: 0,
    leidos: 0,
    sinTexto: 0,
    sinPermiso: 0,
    fallidos: 0,
    esquemaAtrasado: false,
  };
  const vacio: ResultadoDeCorrida = {
    analizadas: 0,
    intactas: 0,
    fallidas: 0,
    pendientes: 0,
    total: 0,
    esquemaAtrasado: false,
    error: null,
    archivos: sinArchivos,
  };

  let tablero: TableroSicop;
  try {
    tablero = await leerTableroSicop();
  } catch (e) {
    return { ...vacio, error: e instanceof Error ? e.message : "No se pudo leer HubSpot" };
  }
  if (!tablero.soportado) return { ...vacio, error: "Falta el scope de tickets en HubSpot" };
  if (tablero.error) return { ...vacio, error: tablero.error };

  const todas = tablero.etapas.flatMap((e) =>
    e.licitaciones.map((l) => ({ licitacion: l, cerrada: e.cerrada })),
  );
  const elegidas = new Set(opciones.ticketIds ?? []);
  const candidatas = elegidas.size > 0 ? todas.filter((x) => elegidas.has(x.licitacion.id)) : todas;

  if (candidatas.length === 0) return { ...vacio, total: todas.length };


  const guardadas = await leerLecturasGuardadas(candidatas.map((x) => x.licitacion.id));
  if (guardadas.esquemaAtrasado) return { ...vacio, total: todas.length, esquemaAtrasado: true };

  const idsCandidatos = candidatas.map((x) => x.licitacion.id);
  let notasPorTicket: Map<string, NotaCruda[]>;
  const archivos = { ...sinArchivos };
  const textoPorTicket = new Map<string, { nombre: string; texto: string }[]>();

  try {
    const hs = await getSystemHubspotClient();
    notasPorTicket = await leerNotasDeTickets(hs, idsCandidatos);

    /* Las FILAS de los archivos se crean SIEMPRE, sea la corrida profunda o no, y funcionan
       aunque falte el scope: es lo que le permite a la pantalla decir "hay 3 archivos" en vez
       de "no hay nada". Bajar el contenido sí es privilegio del modo profundo. */
    const sinc = await sincronizarAdjuntos(notasPorTicket);
    archivos.nuevos = sinc.creados;
    archivos.esquemaAtrasado = sinc.esquemaAtrasado;

    if (opciones.profundo && !sinc.esquemaAtrasado) {
      const porBajar = await adjuntosPorLeer(idsCandidatos, opciones.forzar === true);
      await enParalelo(porBajar, EN_PARALELO, async (a) => {
        const r = await extraerAdjunto(hs, a);
        if (r.estado === "EXTRAIDO") archivos.leidos++;
        else if (r.estado === "SIN_TEXTO") archivos.sinTexto++;
        else if (r.estado === "SIN_PERMISO") archivos.sinPermiso++;
        else archivos.fallidos++;
      });
      for (const id of idsCandidatos) {
        const conTexto = await leerTextoDeAdjuntos(id);
        if (conTexto.length) {
          textoPorTicket.set(
            id,
            conTexto.map((a) => ({ nombre: a.nombre ?? `archivo ${a.hubspotFileId}`, texto: a.texto ?? "" })),
          );
        }
      }
    }
  } catch (e) {
    return {
      ...vacio,
      total: todas.length,
      error: e instanceof Error ? e.message : "No se pudieron leer las notas",
    };
  }

  /* En juego primero, y dentro de eso lo más movido. El tope corta por el final. */
  const ordenadas = [...candidatas].sort((a, b) => {
    if (a.cerrada !== b.cerrada) return a.cerrada ? 1 : -1;
    return (b.licitacion.actualizadaEl ?? "").localeCompare(a.licitacion.actualizadaEl ?? "");
  });

  const trabajo: { ticket: TicketParaLeer; fuente: ReturnType<typeof construirFuente> }[] = [];
  let intactas = 0;
  for (const { licitacion } of ordenadas) {
    const ticket = aTicketParaLeer(
      licitacion,
      notasPorTicket.get(licitacion.id) ?? [],
      textoPorTicket.get(licitacion.id) ?? [],
    );
    const fuente = construirFuente(ticket);
    const previa = guardadas.porTicket.get(licitacion.id);
    /* Una lectura con error NO cuenta como intacta: reintentarla es exactamente el punto. */
    if (!opciones.forzar && previa && previa.fuenteSha === fuente.sha && !previa.lectura.error) {
      intactas++;
      continue;
    }
    trabajo.push({ ticket, fuente });
  }

  const aLeer = trabajo.slice(0, MAX_POR_CORRIDA);
  const pendientes = trabajo.length - aLeer.length;

  let fallidas = 0;
  await enParalelo(aLeer, EN_PARALELO, async ({ ticket, fuente }) => {
    const lectura = await leerLicitacionConIA(fuente);
    if (lectura.error) fallidas++;
    const datos = {
      fuenteSha: fuente.sha,
      notasLeidas: fuente.notas,
      adjuntosSinLeer: fuente.adjuntosSinLeer,
      adjuntosLeidos: fuente.adjuntosLeidos,
      profundo: fuente.profunda,
      fuenteTruncada: fuente.truncada,
      objeto: lectura.objeto,
      institucion: lectura.institucion,
      categorias: lectura.categorias,
      encaje: lectura.encaje,
      encajeRazon: lectura.encajeRazon,
      puntajeEncaje: lectura.puntajeEncaje,
      probabilidad: lectura.probabilidad,
      probabilidadRazon: lectura.probabilidadRazon,
      bloqueantes: lectura.bloqueantes as unknown as Prisma.InputJsonValue,
      evaluacion: lectura.evaluacion,
      pesoPrecio: lectura.pesoPrecio,
      entregables: lectura.entregables,
      plazos: lectura.plazos as unknown as Prisma.InputJsonValue,
      monto: lectura.monto,
      moneda: lectura.moneda,
      confianza: lectura.confianza,
      modelo: lectura.modelo,
      analizadoEl: new Date(lectura.analizadoEl ?? Date.now()),
      error: lectura.error,
    };
    try {
      await prisma.sicopLectura.upsert({
        where: { hubspotTicketId: ticket.id },
        create: { hubspotTicketId: ticket.id, ...datos },
        update: datos,
      });
    } catch (e) {
      /* Una fila que no se pudo guardar no puede tumbar la corrida: se vuelve a intentar en
         la próxima, porque su huella siguió sin coincidir. */
      console.error(`[sicop] no se pudo guardar la lectura de ${ticket.id}:`, e);
      fallidas++;
    }
  });

  return {
    analizadas: aLeer.length,
    intactas,
    fallidas,
    pendientes,
    total: todas.length,
    esquemaAtrasado: false,
    error: null,
    archivos,
  };
}
