/**
 * lib/rentabilidad/foto.ts — LA FOTO DEL MARGEN DE CADA MES. PURO.
 *
 * ── POR QUÉ HAY UNA FOTO ─────────────────────────────────────────────────────
 * Rentabilidad calcula el margen en vivo: lee la planilla, las reuniones del calendario, el cronograma, las respuestas de
 * «¿cuánto te tomó?», los cobros y el tipo de cambio de HOY. Casi todo eso cambia después de que el mes cerró: un cobro
 * registrado tarde, una tarea que se movió de semana, los supuestos que se recalibraron, un CSE que se fue. Sin foto, el
 * margen de agosto mirado en noviembre ya no es el de agosto. La foto guarda, el día 3 del mes siguiente, lo que el
 * cálculo decía de ese mes, con de dónde salió (la versión de los supuestos y el tipo de cambio).
 *
 * ── LAS REGLAS ───────────────────────────────────────────────────────────────
 *  · La foto NO recalcula nada: se arma con lo que devuelve `cargarRentabilidadDelRango` (el MISMO cálculo de la
 *    pantalla) para ese mes. `armarFoto` solo redondea y pone en filas.
 *  · Montos a centavos y horas a centésimas: lo que se guarda es lo que devuelve `armarFoto`, así que escribir el mismo
 *    mes dos veces da las mismas filas.
 *  · Un período de varios meses es la SUMA de sus meses (`juntarMeses`). Las horas y la planilla suman igual que en el
 *    cálculo de todo el rango; lo que cambia es el costo POR PERSONA y POR EQUIPO: cada mes va al costo de la hora de ESE
 *    mes (si alguien tuvo un aumento en septiembre, sus horas de agosto siguen al costo de agosto). El cargado del
 *    período sigue siendo la planilla entera ÷ las horas con clientes.
 *  · Solo meses cerrados (`esMesCerrado`): el mes en curso no tiene foto.
 *
 * ⛔ Lleva el costo de la hora de cada persona (sacado de la planilla): solo dirección (lib/rentabilidad/acceso.ts).
 * ⛔ No convierte monedas: todo llega en dólares.
 */
import { costoDeLaHora, filaDeMargen, type CuentaParaMargen, type FuenteDelCosto, type RangoDelPeriodo } from "./margen";
import type { CostoDeUnaPersona, CostoDeUnEquipo, DatosDeRentabilidad, FuenteDeUnMes, OrigenDelMes } from "./tipos";

/** La forma de lo guardado. Subirla si cambia lo que significa una columna o un JSON. */
/**
 * v2 (2026-10-18): las reuniones del calendario que no son de Meet y las tareas internas (docs/rentabilidad-conectada-plan.md).
 * Una foto v1 se lee con esas horas en cero: no las tenía.
 */
export const VERSION_DE_LA_FOTO = 2;

/** El día del mes (hora de Costa Rica) desde el que se toma la foto del mes que cerró, y la hora. */
export const DIA_DE_LA_FOTO = 3;
export const HORA_DE_LA_FOTO = 7;

export interface FotoDelMes {
  mes: string;
  version: number;
  planilla: number;
  ingreso: number;
  horasPagadas: number;
  horasConClientes: number;
  horasCalendario: number;
  horasRespondidas: number;
  horasEstimadas: number;
  /** La parte de `horasCalendario` que no es de Meet (v2). */
  horasSinMeet: number;
  /** Tareas internas por sus bloques en la agenda (v2). */
  horasTareas: number;
  /** La parte de `horasEstimadas` que es el estimado de una tarea interna sin bloque (v2). */
  horasTareasEstimadas: number;
  horasPorSesion: number;
  costoHoraDirecto: number | null;
  costoHoraCargado: number | null;
  preparacionMin: number;
  supuestos: FuenteDeUnMes["supuestos"];
  tasa: FuenteDeUnMes["tasa"];
  costos: { personas: CostoDeUnaPersona[]; equipos: CostoDeUnEquipo[] };
  personas: { conCosto: number; sinCosto: string[]; fuentes: Record<FuenteDelCosto, number> };
  avisos: string[];
}

export interface FotoDeCuenta {
  mes: string;
  clientId: string;
  nombre: string;
  cse: string | null;
  ingreso: number;
  fuenteIngreso: "Cobranza" | "Odoo" | null;
  /** Reuniones del calendario. */
  horasCalendario: number;
  horasPreparacion: number;
  horasEntrega: number;
  /** La parte de la entrega que respondió quien hizo la tarea. */
  horasRespondidas: number;
  /** Preparación + la entrega sin respuesta + el estimado de las tareas internas sin bloque. */
  horasEstimadas: number;
  /** La parte de `horasCalendario` que no es de Meet (v2). */
  horasSinMeet: number;
  /** Todas las horas de tareas internas (v2): `horasTareasAgenda` + su estimado. */
  horasTareas: number;
  horasTareasAgenda: number;
  reuniones: number;
  planSesiones: number | null;
  planHorasTareas: number | null;
  costoPersona: number;
  costoEquipo: number;
  costoCargado: number;
  margenPersona: number;
  margenEquipo: number;
  margenCargado: number;
  factor: number;
  porPersona: Array<{ email: string; horas: number }>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const r2n = (n: number | null | undefined) => (n === null || n === undefined ? null : r2(n));

const HORA_CR_MS = 6 * 3_600_000;

/** El mes de un instante en Costa Rica: «2026-10». */
export function mesEnCostaRica(d: Date): string {
  const x = new Date(+d - HORA_CR_MS);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) - 1;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** ¿El mes ya cerró? Solo un mes cerrado tiene foto. */
export function esMesCerrado(mes: string, ahora: Date): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes < mesEnCostaRica(ahora);
}

/** El mes que el job fotografía hoy, o null si todavía no toca (antes del día 3 a las 7:00 CR). */
export function mesQueTocaFotografiar(ahora: Date): string | null {
  const x = new Date(+ahora - HORA_CR_MS);
  if (x.getUTCDate() < DIA_DE_LA_FOTO) return null;
  if (x.getUTCDate() === DIA_DE_LA_FOTO && x.getUTCHours() < HORA_DE_LA_FOTO) return null;
  return mesAnterior(mesEnCostaRica(ahora));
}

/** Los meses cerrados del año de `ahora` (en Costa Rica), del 1 de enero al último que cerró. */
export function mesesCerradosDelAnio(ahora: Date): string[] {
  const actual = mesEnCostaRica(ahora);
  const anio = actual.slice(0, 4);
  const out: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const mes = `${anio}-${String(m).padStart(2, "0")}`;
    if (mes < actual) out.push(mes);
  }
  return out;
}

/**
 * La foto de un mes a partir de lo que calculó la pantalla para ESE mes (`datos.rango.meses` = [mes]). Solo redondea:
 * los márgenes salen de `filaDeMargen`, la misma función de la tabla.
 */
export function armarFoto(mes: string, datos: DatosDeRentabilidad): { mes: FotoDelMes; cuentas: FotoDeCuenta[] } {
  if (datos.rango.meses.length !== 1 || datos.rango.meses[0] !== mes) {
    throw new Error(`La foto de ${mes} se arma con el cálculo de ese mes solo (llegó ${datos.rango.meses.join(", ")}).`);
  }
  const tarifa = datos.costoDeLaHora.cargado ?? 0;
  const hs = datos.totales.horasPorSesion;
  const fuente = datos.fuentes.find((f) => f.mes === mes) ?? { mes, supuestos: { id: null, guardadaEn: null, guardadaPor: null }, tasa: null };
  const cuentas: FotoDeCuenta[] = datos.cuentas
    .map((c) => {
      const persona = filaDeMargen(c, tarifa, hs, "persona");
      const equipo = filaDeMargen(c, tarifa, hs, "equipo");
      const cargado = filaDeMargen(c, tarifa, hs, "cargado");
      const declarada = c.horas.declarada ?? 0;
      const tareas = c.horas.tareas ?? 0;
      const tareasAgenda = c.horas.tareasAgenda ?? 0;
      return {
        mes,
        clientId: c.clienteId,
        nombre: c.nombre,
        cse: c.cse,
        ingreso: r2(c.ingreso),
        fuenteIngreso: c.fuenteDelIngreso,
        horasCalendario: r2(c.horas.reuniones),
        horasPreparacion: r2(c.horas.preparacion),
        horasEntrega: r2(c.horas.entrega),
        horasRespondidas: r2(declarada),
        horasEstimadas: r2(c.horas.preparacion + c.horas.entrega - declarada + tareas - tareasAgenda),
        horasSinMeet: r2(c.horas.reunionesSinMeet ?? 0),
        horasTareas: r2(tareas),
        horasTareasAgenda: r2(tareasAgenda),
        reuniones: c.reuniones,
        planSesiones: c.plan ? r2(c.plan.sesiones) : null,
        planHorasTareas: c.plan ? r2(c.plan.horasTareas) : null,
        costoPersona: r2(persona.costo),
        costoEquipo: r2(equipo.costo),
        costoCargado: r2(cargado.costo),
        margenPersona: r2(persona.margen),
        margenEquipo: r2(equipo.margen),
        margenCargado: r2(cargado.margen),
        factor: r2(c.factor ?? 1),
        porPersona: (c.porPersona ?? []).map((p) => ({ email: p.email, horas: r2(p.horas) })),
      };
    })
    .sort((a, b) => a.clientId.localeCompare(b.clientId));
  const redondearPersona = (p: CostoDeUnaPersona): CostoDeUnaPersona => ({
    ...p,
    planilla: r2(p.planilla),
    horasPagadas: r2(p.horasPagadas),
    costoHora: r2n(p.costoHora),
    horasConClientes: r2(p.horasConClientes),
  });
  const redondearEquipo = (e: CostoDeUnEquipo): CostoDeUnEquipo => ({
    ...e,
    planilla: r2(e.planilla),
    horasPagadas: r2(e.horasPagadas),
    costoHora: r2n(e.costoHora),
    horasConClientes: r2(e.horasConClientes),
    parteConClientes: e.parteConClientes === null ? null : r4(e.parteConClientes),
  });
  return {
    mes: {
      mes,
      version: VERSION_DE_LA_FOTO,
      planilla: r2(datos.totales.planilla),
      ingreso: r2(datos.totales.ingreso),
      horasPagadas: r2(datos.totales.horasPagadas),
      horasConClientes: r2(datos.totales.horasConClientes),
      horasCalendario: r2(datos.horasPorOrigen.calendario),
      horasRespondidas: r2(datos.horasPorOrigen.declaradas),
      horasEstimadas: r2(datos.horasPorOrigen.estimadas),
      horasSinMeet: r2(datos.horasPorOrigen.calendarioSinMeet ?? 0),
      horasTareas: r2(datos.horasPorOrigen.tareas ?? 0),
      horasTareasEstimadas: r2(datos.horasPorOrigen.tareasEstimadas ?? 0),
      horasPorSesion: r4(hs),
      costoHoraDirecto: r2n(datos.costoDeLaHora.directo),
      costoHoraCargado: r2n(datos.costoDeLaHora.cargado),
      preparacionMin: datos.preparacionMin,
      supuestos: fuente.supuestos,
      tasa: fuente.tasa,
      costos: { personas: datos.costos.personas.map(redondearPersona), equipos: datos.costos.equipos.map(redondearEquipo) },
      personas: { conCosto: datos.personas.conCosto, sinCosto: [...datos.personas.sinCosto], fuentes: { ...datos.personas.fuentes } },
      avisos: [...datos.avisos],
    },
    cuentas,
  };
}

/** Lo guardado de un mes, de vuelta a la forma que lee la pantalla. */
export function datosDesdeLaFoto(rango: RangoDelPeriodo, mes: FotoDelMes, cuentas: FotoDeCuenta[]): DatosDeRentabilidad {
  const totales = {
    planilla: mes.planilla,
    horasPagadas: mes.horasPagadas,
    horasConClientes: mes.horasConClientes,
    ingreso: mes.ingreso,
    horasPorSesion: mes.horasPorSesion,
  };
  return {
    rango: { periodo: rango.periodo, meses: [mes.mes], etiqueta: rango.etiqueta },
    totales,
    costoDeLaHora: costoDeLaHora(totales),
    cuentas: cuentas.map(
      (c): CuentaParaMargen => ({
        clienteId: c.clientId,
        nombre: c.nombre,
        cse: c.cse,
        ingreso: c.ingreso,
        fuenteDelIngreso: c.fuenteIngreso,
        horas: {
          reuniones: c.horasCalendario,
          preparacion: c.horasPreparacion,
          entrega: c.horasEntrega,
          declarada: c.horasRespondidas,
          reunionesSinMeet: c.horasSinMeet,
          tareas: c.horasTareas,
          tareasAgenda: c.horasTareasAgenda,
        },
        reuniones: c.reuniones,
        plan: c.planSesiones === null && c.planHorasTareas === null ? null : { sesiones: c.planSesiones ?? 0, horasTareas: c.planHorasTareas ?? 0 },
        costos: { persona: c.costoPersona, equipo: c.costoEquipo },
        factor: c.factor,
        porPersona: c.porPersona,
      }),
    ),
    personas: mes.personas,
    costos: mes.costos,
    horasPorOrigen: {
      calendario: mes.horasCalendario,
      declaradas: mes.horasRespondidas,
      estimadas: mes.horasEstimadas,
      calendarioSinMeet: mes.horasSinMeet,
      tareas: mes.horasTareas,
      tareasEstimadas: mes.horasTareasEstimadas,
    },
    // Una foto v1 no contaba las reuniones fuera de Meet ni las tareas internas: se dice, no se completa sola.
    avisos:
      mes.version < 2
        ? [...mes.avisos, "Esta foto es de antes de contar las reuniones fuera de Meet y las tareas internas: «Volver a tomar» las suma."]
        : mes.avisos,
    preparacionMin: mes.preparacionMin,
    fuentes: [{ mes: mes.mes, supuestos: mes.supuestos, tasa: mes.tasa }],
  };
}

/**
 * Un período de varios meses como la suma de sus meses (cada uno en vivo o desde su foto). Los meses van del más viejo
 * al más nuevo: el nombre, el CSE y el factor de una cuenta son los del último mes en que aparece.
 */
export function juntarMeses(rango: RangoDelPeriodo, meses: DatosDeRentabilidad[], origenes?: OrigenDelMes[]): DatosDeRentabilidad {
  const varios = meses.length > 1;
  // ── Las cuentas ──
  const cuentas = new Map<string, CuentaParaMargen & { porPersonaMapa: Map<string, number> }>();
  for (const d of meses) {
    for (const c of d.cuentas) {
      const x = cuentas.get(c.clienteId);
      if (!x) {
        cuentas.set(c.clienteId, {
          ...c,
          horas: {
            ...c.horas,
            declarada: c.horas.declarada ?? 0,
            reunionesSinMeet: c.horas.reunionesSinMeet ?? 0,
            tareas: c.horas.tareas ?? 0,
            tareasAgenda: c.horas.tareasAgenda ?? 0,
          },
          plan: c.plan ? { ...c.plan } : null,
          costos: c.costos ? { ...c.costos } : undefined,
          porPersonaMapa: new Map((c.porPersona ?? []).map((p) => [p.email, p.horas])),
        });
        continue;
      }
      x.nombre = c.nombre;
      x.cse = c.cse;
      x.factor = c.factor ?? x.factor;
      x.ingreso += c.ingreso;
      x.fuenteDelIngreso = x.fuenteDelIngreso === "Cobranza" || c.fuenteDelIngreso === "Cobranza" ? "Cobranza" : (x.fuenteDelIngreso ?? c.fuenteDelIngreso);
      x.horas.reuniones += c.horas.reuniones;
      x.horas.preparacion += c.horas.preparacion;
      x.horas.entrega += c.horas.entrega;
      x.horas.declarada = (x.horas.declarada ?? 0) + (c.horas.declarada ?? 0);
      x.horas.reunionesSinMeet = (x.horas.reunionesSinMeet ?? 0) + (c.horas.reunionesSinMeet ?? 0);
      x.horas.tareas = (x.horas.tareas ?? 0) + (c.horas.tareas ?? 0);
      x.horas.tareasAgenda = (x.horas.tareasAgenda ?? 0) + (c.horas.tareasAgenda ?? 0);
      x.reuniones += c.reuniones;
      if (c.plan) x.plan = x.plan ? { sesiones: x.plan.sesiones + c.plan.sesiones, horasTareas: x.plan.horasTareas + c.plan.horasTareas } : { ...c.plan };
      if (c.costos) x.costos = x.costos ? { persona: x.costos.persona + c.costos.persona, equipo: x.costos.equipo + c.costos.equipo } : { ...c.costos };
      for (const p of c.porPersona ?? []) x.porPersonaMapa.set(p.email, (x.porPersonaMapa.get(p.email) ?? 0) + p.horas);
    }
  }
  const listaDeCuentas: CuentaParaMargen[] = [...cuentas.values()].map(({ porPersonaMapa, ...c }) => ({
    ...c,
    porPersona: [...porPersonaMapa.entries()].map(([email, horas]) => ({ email, horas })).sort((a, b) => b.horas - a.horas),
  }));

  // ── Las personas ──
  const personas = new Map<string, CostoDeUnaPersona>();
  for (const d of meses) {
    for (const p of d.costos.personas) {
      const x = personas.get(p.id);
      if (!x) {
        personas.set(p.id, { ...p });
        continue;
      }
      x.nombre = p.nombre;
      x.equipo = p.equipo;
      x.planilla += p.planilla;
      x.horasPagadas += p.horasPagadas;
      x.horasConClientes += p.horasConClientes;
      x.fuente = p.fuente ?? x.fuente;
    }
  }
  for (const p of personas.values()) p.costoHora = p.planilla > 0 && p.horasPagadas > 0 ? p.planilla / p.horasPagadas : null;
  const listaDePersonas = [...personas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const conCosto = listaDePersonas.filter((p) => p.planilla > 0);

  // ── Los equipos ──
  const equipos = new Map<string, CostoDeUnEquipo>();
  for (const d of meses) {
    for (const e of d.costos.equipos) {
      const x = equipos.get(e.equipo) ?? { equipo: e.equipo, personas: 0, planilla: 0, horasPagadas: 0, costoHora: null, horasConClientes: 0, parteConClientes: null };
      x.planilla += e.planilla;
      x.horasPagadas += e.horasPagadas;
      x.horasConClientes += e.horasConClientes;
      equipos.set(e.equipo, x);
    }
  }
  const listaDeEquipos = [...equipos.values()]
    .map((e) => ({
      ...e,
      // Un equipo solo existe con alguien que tuvo planilla: se cuentan las personas distintas, no la suma de los meses.
      personas: conCosto.filter((p) => p.equipo === e.equipo).length,
      costoHora: e.horasPagadas > 0 ? e.planilla / e.horasPagadas : null,
      parteConClientes: e.horasPagadas > 0 ? e.horasConClientes / e.horasPagadas : null,
    }))
    .sort((a, b) => a.equipo.localeCompare(b.equipo, "es"));

  // ── Los totales ──
  const suma = (f: (d: DatosDeRentabilidad) => number) => meses.reduce((a, d) => a + f(d), 0);
  const horasDeReunion = listaDeCuentas.reduce((a, c) => a + c.horas.reuniones + c.horas.preparacion, 0);
  const reunionesTotal = listaDeCuentas.reduce((a, c) => a + c.reuniones, 0);
  const totales = {
    planilla: suma((d) => d.totales.planilla),
    horasPagadas: suma((d) => d.totales.horasPagadas),
    horasConClientes: suma((d) => d.totales.horasConClientes),
    ingreso: suma((d) => d.totales.ingreso),
    horasPorSesion: reunionesTotal > 0 ? horasDeReunion / reunionesTotal : 0,
  };
  const conCostoNombres = new Set(conCosto.map((p) => p.nombre));
  const sinCosto = [...new Set(meses.flatMap((d) => d.personas.sinCosto))].filter((n) => !conCostoNombres.has(n));
  const fuentes: Record<FuenteDelCosto, number> = { libro: 0, "libro-media": 0, "costo-recurrente": 0 };
  for (const d of meses) for (const k of Object.keys(fuentes) as FuenteDelCosto[]) fuentes[k] += d.personas.fuentes[k] ?? 0;

  const etiquetaDe = new Map((origenes ?? []).map((o) => [o.mes, o.etiqueta]));
  const avisos = [
    ...new Set(
      meses.flatMap((d) => d.avisos.map((a) => (varios ? `${etiquetaDe.get(d.rango.meses[0]) ?? d.rango.meses[0]}: ${a}` : a))),
    ),
  ];

  return {
    rango: { periodo: rango.periodo, meses: rango.meses, etiqueta: rango.etiqueta },
    totales,
    costoDeLaHora: costoDeLaHora(totales),
    cuentas: listaDeCuentas,
    personas: { conCosto: conCosto.length, sinCosto, fuentes },
    costos: { personas: listaDePersonas, equipos: listaDeEquipos },
    horasPorOrigen: {
      calendario: suma((d) => d.horasPorOrigen.calendario),
      declaradas: suma((d) => d.horasPorOrigen.declaradas),
      estimadas: suma((d) => d.horasPorOrigen.estimadas),
      calendarioSinMeet: suma((d) => d.horasPorOrigen.calendarioSinMeet ?? 0),
      tareas: suma((d) => d.horasPorOrigen.tareas ?? 0),
      tareasEstimadas: suma((d) => d.horasPorOrigen.tareasEstimadas ?? 0),
    },
    fuentesDeHoras: meses.length === 1 ? meses[0].fuentesDeHoras : undefined,
    avisos,
    preparacionMin: meses.at(-1)?.preparacionMin ?? 0,
    fuentes: meses.flatMap((d) => d.fuentes),
    origenDeLosMeses: origenes,
  };
}

/** La línea que dice de dónde salen los meses de un período, para la cabecera. */
export function resumenDelOrigen(origenes: OrigenDelMes[] | undefined): string | null {
  if (!origenes?.length) return null;
  const fotos = origenes.filter((o) => o.origen === "foto").length;
  if (fotos === origenes.length) return origenes.length === 1 ? "Desde la foto del mes" : "Todos los meses desde su foto";
  if (fotos === 0) return origenes.length === 1 ? "En vivo: el mes no tiene foto" : "En vivo: ningún mes tiene foto";
  return `${fotos} de ${origenes.length} meses desde su foto; el resto, en vivo`;
}
