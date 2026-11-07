/**
 * lib/uso/periodo.ts — «Uso de Nexus» › Equipo: cuánto usa Nexus cada persona y cada equipo en el período que se elige
 * (mes, trimestre, semestre o año en curso, en hora de Costa Rica). PURO: lo lee lib/uso/lectura-server.ts
 * (`usoPorPeriodo`) y lo prueba lib/uso/periodo.test.ts.
 *
 * Dos números por persona (pedido de Elías, 2026-11-07): los días que entró (días distintos con al menos una apertura en
 * `UsoDeNexus`) y las llamadas a la IA que disparó, con su costo y los agentes que más usó. El avance del cronograma que
 * corre tras una reunión no cuenta como de nadie (`esDeUnaPersona`). En orden alfabético dentro de cada equipo: sin
 * ranking.
 *
 * Dos cosas que no se esconden (revisión del 2026-11-07): las llamadas de un modelo sin tarifa se cuentan aparte
 * (`sinTarifa`, el mismo criterio que lib/uso/ia.ts) en vez de sumar US$ 0 al costo, y quien ya no está entra si tuvo
 * uso en el período, al final de su equipo con «(ya no está)»: si no, su uso se perdía del total.
 */
import { esDeUnaPersona } from "./ia";

export type Periodo = "mes" | "trimestre" | "semestre" | "anio";

export const PERIODOS: readonly { clave: Periodo; etiqueta: string }[] = [
  { clave: "mes", etiqueta: "Mes" },
  { clave: "trimestre", etiqueta: "Trimestre" },
  { clave: "semestre", etiqueta: "Semestre" },
  { clave: "anio", etiqueta: "Año" },
];

export const esPeriodo = (v: unknown): v is Periodo => PERIODOS.some((p) => p.clave === v);

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_DEL_PERIODO: Record<Periodo, number> = { mes: 1, trimestre: 3, semestre: 6, anio: 12 };

export interface RangoDelPeriodo {
  /** El primer día del período (AAAA-MM-DD, Costa Rica). */
  desde: string;
  /** Hoy (AAAA-MM-DD, Costa Rica): el período en curso termina hoy. */
  hasta: string;
  /** El inicio del período como instante (medianoche de Costa Rica, UTC−6). */
  desdeInstante: Date;
  /** «noviembre 2026», «oct – dic 2026», «jul – dic 2026», «2026». */
  nombre: string;
}

/** El período en curso que contiene `hoy` (AAAA-MM-DD en Costa Rica). */
export function rangoDelPeriodo(periodo: Periodo, hoy: string): RangoDelPeriodo {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7)) - 1;
  const largo = MESES_DEL_PERIODO[periodo];
  const primerMes = Math.floor(mes / largo) * largo;
  const desde = `${anio}-${String(primerMes + 1).padStart(2, "0")}-01`;
  const ultimoMes = primerMes + largo - 1;
  const nombre =
    periodo === "mes"
      ? `${MESES[mes]} ${anio}`
      : periodo === "anio"
        ? String(anio)
        : `${MESES_CORTOS[primerMes]} – ${MESES_CORTOS[ultimoMes]} ${anio}`;
  return { desde, hasta: hoy, desdeInstante: new Date(`${desde}T06:00:00Z`), nombre };
}

export interface PersonaDelEquipo {
  email: string;
  nombre: string;
  equipo: string;
  /** Sigue en el equipo. Quien ya no está solo aparece si tuvo uso en el período. */
  activo: boolean;
}

/** Una fila de `UsoDeNexus` agrupada por persona y día. */
export interface DiaConUso {
  personaEmail: string;
  dia: string;
}

/** Las llamadas a la IA agrupadas por quien las disparó, agente y origen. */
export interface LlamadasAgrupadas {
  triggeredByEmail: string | null;
  agentSlug: string | null;
  origen: string | null;
  llamadas: number;
  /** El costo de las que tienen tarifa. */
  costo: number;
  /** Las de un modelo sin tarifa: están en `llamadas`, no en `costo`. */
  sinTarifa: number;
}

export interface UsoDeUnaPersona {
  email: string;
  /** Con «(ya no está)» si ya no está en el equipo. */
  nombre: string;
  dias: number;
  llamadas: number;
  costo: number;
  sinTarifa: number;
  /** Los 3 agentes que más usó, por llamadas. */
  agentes: { nombre: string; llamadas: number }[];
}

export interface UsoDeUnEquipo {
  equipo: string;
  personas: UsoDeUnaPersona[];
  total: { dias: number; llamadas: number; costo: number; sinTarifa: number; conUso: number };
}

export interface UsoDelPeriodo {
  equipos: UsoDeUnEquipo[];
  /** Los máximos de una persona, para el largo de las barras. */
  maximo: { dias: number; llamadas: number };
}

/**
 * Junta los días y las llamadas de cada persona. `personas` llega en el orden de la pantalla (por equipo y, dentro,
 * alfabético); quien ya no está va al final de su equipo y solo si tuvo uso. Lo de alguien que no está en la lista (una
 * cuenta de prueba) no se muestra.
 */
export function usoDelPeriodo(
  personas: readonly PersonaDelEquipo[],
  dias: readonly DiaConUso[],
  llamadas: readonly LlamadasAgrupadas[],
  nombreDelAgente: (slug: string | null) => string,
): UsoDelPeriodo {
  const diasPor = new Map<string, Set<string>>();
  for (const d of dias) {
    const email = d.personaEmail.toLowerCase();
    const s = diasPor.get(email) ?? new Set<string>();
    s.add(d.dia);
    diasPor.set(email, s);
  }
  const iaPor = new Map<string, { llamadas: number; costo: number; sinTarifa: number; agentes: Map<string, number> }>();
  for (const l of llamadas) {
    if (!esDeUnaPersona(l)) continue;
    const email = l.triggeredByEmail!.toLowerCase();
    const p = iaPor.get(email) ?? { llamadas: 0, costo: 0, sinTarifa: 0, agentes: new Map<string, number>() };
    p.llamadas += l.llamadas;
    p.costo += l.costo;
    p.sinTarifa += l.sinTarifa;
    const nombre = nombreDelAgente(l.agentSlug);
    p.agentes.set(nombre, (p.agentes.get(nombre) ?? 0) + l.llamadas);
    iaPor.set(email, p);
  }

  const equipos: UsoDeUnEquipo[] = [];
  let maxDias = 0;
  let maxLlamadas = 0;
  // Las activas primero y después las que ya no están: cada grupo conserva el orden alfabético que traía.
  const enOrden = [...personas.filter((m) => m.activo), ...personas.filter((m) => !m.activo)];
  for (const m of enOrden) {
    const email = m.email.toLowerCase();
    const ia = iaPor.get(email);
    const dias = diasPor.get(email)?.size ?? 0;
    if (!m.activo && !dias && !ia?.llamadas) continue;
    const fila: UsoDeUnaPersona = {
      email,
      nombre: m.activo ? m.nombre : `${m.nombre} (ya no está)`,
      dias,
      llamadas: ia?.llamadas ?? 0,
      costo: ia?.costo ?? 0,
      sinTarifa: ia?.sinTarifa ?? 0,
      agentes: ia
        ? [...ia.agentes.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 3)
            .map(([nombre, n]) => ({ nombre, llamadas: n }))
        : [],
    };
    maxDias = Math.max(maxDias, fila.dias);
    maxLlamadas = Math.max(maxLlamadas, fila.llamadas);
    let e = equipos.find((x) => x.equipo === m.equipo);
    if (!e) {
      e = { equipo: m.equipo, personas: [], total: { dias: 0, llamadas: 0, costo: 0, sinTarifa: 0, conUso: 0 } };
      equipos.push(e);
    }
    e.personas.push(fila);
    e.total.dias += fila.dias;
    e.total.llamadas += fila.llamadas;
    e.total.costo += fila.costo;
    e.total.sinTarifa += fila.sinTarifa;
    if (fila.dias > 0 || fila.llamadas > 0) e.total.conUso++;
  }
  // Un equipo donde solo queda alguien que ya no está conserva su lugar entre los equipos.
  const ordenDeEquipos = [...new Set(personas.map((m) => m.equipo))];
  equipos.sort((a, b) => ordenDeEquipos.indexOf(a.equipo) - ordenDeEquipos.indexOf(b.equipo));
  return { equipos, maximo: { dias: maxDias, llamadas: maxLlamadas } };
}
