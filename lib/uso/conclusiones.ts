/**
 * lib/uso/conclusiones.ts — la pestaña «Conclusiones» de «Uso de Nexus»: una lectura corta de lo que dicen los números,
 * armada con REGLAS (sin IA). PURO: lo prueba lib/uso/conclusiones.test.ts.
 *
 * Tres preguntas: qué equipo usa poco Nexus, qué propuesta casi nunca se usa y qué proceso de IA cuesta mucho para lo
 * que se usa. Más los avisos de los datos (lo que no se puede leer bien). Cada regla tiene su umbral escrito acá
 * (`UMBRALES`) y un mínimo de casos: con pocos datos no se concluye nada.
 *
 * ⚠ Sirve para entender el uso, no para evaluar a nadie: habla de EQUIPOS, de tipos de propuesta y de procesos, nunca
 * de una persona.
 */
import type { ConteoDeTipo } from "@/lib/lo-propuesto/conteo";
import { PROCESO_POR_CLAVE, numero, parteUsada, pct, usd, type ClaveDeProceso, type IaPorProceso, type SumaDeIA, type UsoDeLoQuePropone } from "./ia";
import type { VistaDeUso } from "./vistas";

export const UMBRALES = {
  /** Un equipo usa poco si entra menos de esto por persona y por semana. */
  diasPorSemanaPocoUso: 1,
  /** Sin estos días medidos no se habla de equipos. */
  diasMedidosMinimos: 7,
  /** Una propuesta «casi nunca se usa» con menos de esta parte usada… */
  parteCasiNunca: 0.2,
  /** …y «se usa» con esta parte o más… */
  parteSeUsa: 0.7,
  /** …siempre que se hayan cerrado (usadas, desestimadas o vencidas) al menos estas. */
  cerradasMinimas: 8,
  /** Pendientes que se juntan sin decidir. */
  pendientesQueSeJuntan: 20,
  /** Un proceso «cuesta mucho» si se lleva esta parte del gasto de IA… */
  parteDelGastoAlta: 0.15,
  /** …y de lo que propone se usa menos que esto. */
  parteUsadaBaja: 0.25,
  /** Un proceso «falla seguido» con esta parte de llamadas con error, desde este mínimo de llamadas. */
  parteConError: 0.1,
  llamadasMinimas: 20,
  /** Parte del gasto sin proceso o sin empresa que vale avisar. */
  parteSinProceso: 0.1,
  parteSinEmpresa: 0.2,
} as const;

export type Tono = "atencion" | "info" | "bien";
export type TemaDeConclusion = "equipo" | "propuesta" | "proceso" | "datos";

export interface Conclusion {
  id: string;
  tema: TemaDeConclusion;
  tono: Tono;
  titulo: string;
  detalle: string;
  /** La pestaña donde se ve el detalle. */
  ver?: VistaDeUso;
}

export interface PersonaParaConcluir {
  equipo: string;
  diasConUso: number;
  diasEstaSemana: number;
}

export interface EntradaDeConclusiones {
  equipo: {
    personas: readonly PersonaParaConcluir[];
    /** Días con medición dentro de la ventana de 4 semanas (de `medidoDesde` o el primer día, hasta hoy). */
    diasMedidos: number;
  } | null;
  propuesto: readonly (Pick<ConteoDeTipo, "tipo" | "nacieron" | "usados" | "desestimados" | "vencidos" | "pendientes"> & { nombre: string })[];
  ia: {
    dias: number;
    total: SumaDeIA;
    sinCliente: SumaDeIA;
    porProceso: readonly IaPorProceso[];
    propuestoPorProceso: Partial<Record<ClaveDeProceso, UsoDeLoQuePropone>>;
    corridasConError: Partial<Record<ClaveDeProceso, number>>;
    llegoAlTope: boolean;
  } | null;
}

const ORDEN_DEL_TONO: Record<Tono, number> = { atencion: 0, info: 1, bien: 2 };
const veces = (n: number, uno: string, varios: string) => `${numero(n)} ${n === 1 ? uno : varios}`;

function deLosEquipos(e: NonNullable<EntradaDeConclusiones["equipo"]>): Conclusion[] {
  if (e.diasMedidos < UMBRALES.diasMedidosMinimos) {
    return [
      {
        id: "equipo:poco-medido",
        tema: "datos",
        tono: "info",
        titulo: "Todavía no alcanza para hablar de equipos",
        detalle: `El uso se mide hace ${veces(e.diasMedidos, "día", "días")}. Con una semana entera se puede leer qué equipo entra poco.`,
        ver: "equipo",
      },
    ];
  }
  const semanas = e.diasMedidos / 7;
  const por = new Map<string, PersonaParaConcluir[]>();
  for (const p of e.personas) {
    if (p.equipo === "Sin equipo") continue;
    por.set(p.equipo, [...(por.get(p.equipo) ?? []), p]);
  }
  const out: Conclusion[] = [];
  for (const [equipo, personas] of por) {
    const diasPorPersona = personas.reduce((s, p) => s + p.diasConUso, 0) / personas.length;
    const porSemana = diasPorPersona / semanas;
    if (porSemana >= UMBRALES.diasPorSemanaPocoUso) continue;
    const estaSemana = personas.filter((p) => p.diasEstaSemana > 0).length;
    out.push({
      id: `equipo:${equipo}`,
      tema: "equipo",
      tono: "atencion",
      titulo: `${equipo} entra poco a Nexus`,
      detalle:
        `${numero(diasPorPersona, 1)} días con uso por persona en ${numero(semanas, 0)} ${semanas >= 1.5 ? "semanas" : "semana"}, ` +
        `menos de uno por semana. Esta semana entraron ${estaSemana} de ${personas.length}.`,
      ver: "equipo",
    });
  }
  return out;
}

function deLasPropuestas(propuesto: EntradaDeConclusiones["propuesto"]): Conclusion[] {
  const out: Conclusion[] = [];
  for (const t of propuesto) {
    const cerradas = t.usados + t.desestimados + t.vencidos;
    if (cerradas >= UMBRALES.cerradasMinimas) {
      const parte = t.usados / cerradas;
      if (parte < UMBRALES.parteCasiNunca) {
        const porQue =
          t.vencidos > t.desestimados
            ? "Casi todas vencen sin que nadie las mire: ¿le llegan a quien las tiene que decidir?"
            : "Casi todas se desestiman: lo que propone no sirve como está.";
        out.push({
          id: `propuesta:casi-nunca:${t.tipo}`,
          tema: "propuesta",
          tono: "atencion",
          titulo: `Casi nunca se usa: ${t.nombre.toLowerCase()}`,
          detalle: `Se usaron ${t.usados} de ${cerradas} (${pct(parte)}): ${veces(t.vencidos, "venció", "vencieron")} y ${veces(t.desestimados, "se desestimó", "se desestimaron")}. ${porQue}`,
          ver: "propuesto",
        });
      } else if (parte >= UMBRALES.parteSeUsa) {
        out.push({
          id: `propuesta:se-usa:${t.tipo}`,
          tema: "propuesta",
          tono: "bien",
          titulo: `Se usa: ${t.nombre.toLowerCase()}`,
          detalle: `Se usaron ${t.usados} de ${cerradas} (${pct(parte)}).`,
          ver: "propuesto",
        });
      }
    }
    if (t.pendientes >= UMBRALES.pendientesQueSeJuntan) {
      out.push({
        id: `propuesta:pendientes:${t.tipo}`,
        tema: "propuesta",
        tono: "info",
        titulo: `Se juntan sin decidir: ${t.nombre.toLowerCase()}`,
        detalle: `${numero(t.pendientes)} esperan que alguien las use o las desestime.`,
        ver: "propuesto",
      });
    }
  }
  return out;
}

function deLosProcesos(ia: NonNullable<EntradaDeConclusiones["ia"]>): Conclusion[] {
  const out: Conclusion[] = [];
  const total = ia.total.costo;
  for (const p of ia.porProceso) {
    const def = PROCESO_POR_CLAVE.get(p.clave);
    if (!def) continue;
    const parteDelGasto = total > 0 ? p.costo / total : 0;
    const propuesto = ia.propuestoPorProceso[p.clave];
    if (parteDelGasto >= UMBRALES.parteDelGastoAlta && def.propone.length > 0 && p.clave !== "sin-identificar") {
      const parte = propuesto ? parteUsada(propuesto) : null;
      if (parte !== null && parte < UMBRALES.parteUsadaBaja) {
        out.push({
          id: `proceso:caro:${p.clave}`,
          tema: "proceso",
          tono: "atencion",
          titulo: `${def.nombre} cuesta mucho para lo que se usa`,
          detalle: `Se lleva el ${pct(parteDelGasto)} del gasto de IA (${usd(p.costo)}) y de lo que propone se usó el ${pct(parte)}.`,
          ver: "procesos",
        });
      } else if (!propuesto || propuesto.nacieron === 0) {
        out.push({
          id: `proceso:sin-propuestas:${p.clave}`,
          tema: "proceso",
          tono: "info",
          titulo: `${def.nombre} gasta y no dejó nada para decidir`,
          detalle: `Se lleva el ${pct(parteDelGasto)} del gasto de IA (${usd(p.costo)}) y en ${ia.dias} días no propuso nada que alguien pudiera usar.`,
          ver: "procesos",
        });
      }
    }
    if (p.clave === "avance" && parteDelGasto >= UMBRALES.parteSinProceso) {
      out.push({
        id: "proceso:avance",
        tema: "proceso",
        tono: "info",
        titulo: "El avance del cronograma corre solo tras cada reunión",
        detalle: `${usd(p.costo)} (${pct(parteDelGasto)} del gasto) sin que nadie lo pida. No cuenta como uso de nadie.`,
        ver: "procesos",
      });
    }
    const corridasMal = ia.corridasConError[p.clave] ?? 0;
    if (p.llamadas >= UMBRALES.llamadasMinimas && p.conError / p.llamadas >= UMBRALES.parteConError) {
      out.push({
        id: `proceso:falla:${p.clave}`,
        tema: "proceso",
        tono: "atencion",
        titulo: `${def.nombre} falla seguido`,
        detalle:
          `${numero(p.conError)} de ${numero(p.llamadas)} llamadas terminaron con error` +
          (corridasMal ? ` y ${veces(corridasMal, "corrida terminó", "corridas terminaron")} en error.` : "."),
        ver: "procesos",
      });
    }
  }
  return out;
}

function deLosDatos(ia: NonNullable<EntradaDeConclusiones["ia"]>): Conclusion[] {
  const out: Conclusion[] = [];
  const total = ia.total.costo;
  if (ia.llegoAlTope) {
    out.push({
      id: "datos:tope",
      tema: "datos",
      tono: "atencion",
      titulo: "Hay más llamadas de las que se leen",
      detalle: "Se llegó al tope de llamadas: los totales de IA son un piso, no el gasto entero.",
      ver: "procesos",
    });
  }
  const sinProceso = ia.porProceso.find((p) => p.clave === "sin-identificar");
  if (sinProceso && total > 0 && sinProceso.costo / total >= UMBRALES.parteSinProceso) {
    out.push({
      id: "datos:sin-proceso",
      tema: "datos",
      tono: "info",
      titulo: "Parte del gasto no dice de qué proceso es",
      detalle: `${usd(sinProceso.costo)} (${pct(sinProceso.costo / total)}) en ${veces(sinProceso.llamadas, "llamada", "llamadas")} sin agente anotado. No se adivina.`,
      ver: "procesos",
    });
  }
  if (total > 0 && ia.sinCliente.costo / total >= UMBRALES.parteSinEmpresa) {
    out.push({
      id: "datos:sin-empresa",
      tema: "datos",
      tono: "info",
      titulo: "Parte del gasto no dice de qué empresa es",
      detalle: `${usd(ia.sinCliente.costo)} (${pct(ia.sinCliente.costo / total)}) no se pudo ubicar en una empresa.`,
      ver: "clientes",
    });
  }
  if (ia.total.sinTarifa > 0) {
    out.push({
      id: "datos:sin-tarifa",
      tema: "datos",
      tono: "info",
      titulo: "Hay llamadas sin tarifa",
      detalle: `${veces(ia.total.sinTarifa, "llamada usa", "llamadas usan")} un modelo sin precio cargado: no están en el gasto.`,
      ver: "procesos",
    });
  }
  return out;
}

/** Todas las conclusiones, primero lo que pide atención, después lo informativo y al final lo que va bien. */
export function concluir(e: EntradaDeConclusiones): Conclusion[] {
  const todas = [
    ...(e.equipo ? deLosEquipos(e.equipo) : []),
    ...deLasPropuestas(e.propuesto),
    ...(e.ia ? deLosProcesos(e.ia) : []),
    ...(e.ia ? deLosDatos(e.ia) : []),
  ];
  return todas.map((c, i) => ({ c, i })).sort((a, b) => ORDEN_DEL_TONO[a.c.tono] - ORDEN_DEL_TONO[b.c.tono] || a.i - b.i).map((x) => x.c);
}
