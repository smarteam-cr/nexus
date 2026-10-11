/**
 * lib/lo-propuesto/conteo.ts — cómo se cuenta lo propuesto de una ventana. PURO.
 *
 * La población es lo que NACIÓ en la ventana `[desde, hasta)`, y cada número dice cómo está HOY: si una propuesta de
 * la semana pasada se usó ayer, cuenta como usada. Las decisiones de la ventana sobre propuestas que nacieron antes se
 * cuentan aparte (`deAntes`) y no entran a los demás números: así ninguna propuesta se cuenta dos veces.
 *
 * `porPersona` dice quién usó o desestimó lo de la población. ⚠ Es dato sensible: lo muestra solo quien ve el uso
 * del equipo, sin ranking y en orden alfabético (DECISIONS, «Uso de Nexus»). Lo que se cerró sin firma no tiene persona.
 */
import { GUARDA, MODULO_DEL_TIPO, type ClaveDeTipo, type EstadoCalculado, type ModuloDeLoPropuesto } from "./tipos";

export interface PorPersona {
  usados: number;
  desestimados: number;
}

export interface ConteoDeTipo {
  tipo: ClaveDeTipo;
  modulo: ModuloDeLoPropuesto;
  nacieron: number;
  /** Decisiones de la ventana sobre propuestas que nacieron antes. */
  deAntes: number;
  pendientes: number;
  usados: number;
  desestimados: number;
  vencidos: number;
  /** Usadas o desestimadas sin una persona detrás (ya contadas en usados o desestimados). */
  sinFirma: number;
  porPersona: Record<string, PorPersona>;
  guarda: { quien: boolean; descarte: boolean };
}

export interface Ventana {
  desde: Date;
  hasta: Date;
}

export type ItemParaContar = EstadoCalculado & { nacioEn: string };

const enLaVentana = (isoFecha: string | null, v: Ventana): boolean => {
  if (!isoFecha) return false;
  const t = new Date(isoFecha).getTime();
  return t >= v.desde.getTime() && t < v.hasta.getTime();
};

export function conteoVacio(tipo: ClaveDeTipo): ConteoDeTipo {
  return {
    tipo,
    modulo: MODULO_DEL_TIPO[tipo],
    nacieron: 0,
    deAntes: 0,
    pendientes: 0,
    usados: 0,
    desestimados: 0,
    vencidos: 0,
    sinFirma: 0,
    porPersona: {},
    guarda: GUARDA[tipo],
  };
}

export function contarTipo(tipo: ClaveDeTipo, items: readonly ItemParaContar[], v: Ventana): ConteoDeTipo {
  const c = conteoVacio(tipo);
  for (const it of items) {
    const decidido = it.estado === "usado" || it.estado === "desestimado";
    if (!enLaVentana(it.nacioEn, v)) {
      if (decidido && new Date(it.nacioEn).getTime() < v.desde.getTime() && enLaVentana(it.decididoEn, v)) c.deAntes++;
      continue;
    }
    c.nacieron++;
    if (it.estado === "pendiente") c.pendientes++;
    else if (it.estado === "vencido") c.vencidos++;
    else if (it.estado === "usado") c.usados++;
    else c.desestimados++;
    if (!decidido) continue;
    if (it.sinFirma) c.sinFirma++;
    if (it.decididoPor) {
      const p = (c.porPersona[it.decididoPor] ??= { usados: 0, desestimados: 0 });
      if (it.estado === "usado") p.usados++;
      else p.desestimados++;
    }
  }
  return c;
}

/** Suma conteos (de varios tipos, o de un módulo). La guarda resultante es la del más débil. */
export function sumarConteos(conteos: readonly ConteoDeTipo[]): Omit<ConteoDeTipo, "tipo" | "modulo"> {
  const total: Omit<ConteoDeTipo, "tipo" | "modulo"> = {
    nacieron: 0,
    deAntes: 0,
    pendientes: 0,
    usados: 0,
    desestimados: 0,
    vencidos: 0,
    sinFirma: 0,
    porPersona: {},
    guarda: { quien: true, descarte: true },
  };
  for (const c of conteos) {
    total.nacieron += c.nacieron;
    total.deAntes += c.deAntes;
    total.pendientes += c.pendientes;
    total.usados += c.usados;
    total.desestimados += c.desestimados;
    total.vencidos += c.vencidos;
    total.sinFirma += c.sinFirma;
    total.guarda = { quien: total.guarda.quien && c.guarda.quien, descarte: total.guarda.descarte && c.guarda.descarte };
    for (const [persona, p] of Object.entries(c.porPersona)) {
      const t = (total.porPersona[persona] ??= { usados: 0, desestimados: 0 });
      t.usados += p.usados;
      t.desestimados += p.desestimados;
    }
  }
  return total;
}
