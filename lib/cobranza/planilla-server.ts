/**
 * lib/cobranza/planilla-server.ts — qué quincenas del libro de planilla faltan generar, leído de la base (2026-10-12).
 *
 * Lo usan «Completar las que faltan» (`completarQuincenas`) y el historial de planilla (`loadLibroPlanilla`), para que
 * el botón y la lista que ve Alex digan lo mismo. Antes la pantalla lo calculaba aparte, con las filas que tenía.
 *
 * ── POR QUÉ LEE EL CATÁLOGO ─────────────────────────────────────────────────────
 * Una quincena con UNA fila contaba como generada. Medido en prod el 2026-10-12: Alex anotó a Alejandra desde el
 * calendario en la 2.ª de agosto y las dos de septiembre, y esas tres quincenas quedaron con una sola persona de 11 a
 * 13. El botón no aparecía y el punto de equilibrio contaba esos meses con una planilla de US$600. Ahora una quincena
 * a medias (`quincenaAMedias`, menos de la mitad de las personas que tenían salario en ella) vuelve a faltar, y
 * completarla agrega solo a quien no está: la fila que ya existe no se toca (CREATE-ONLY, `skipDuplicates`).
 */
import { prisma } from "@/lib/db/prisma";
import { salarioVigenteEn, type MovimientoDeSalario } from "./calendario-planilla";
import { quincenasDelPeriodo, quincenasGeneradas, quincenasPorGenerar, type Periodo } from "./planilla";

export interface PersonaConSalario {
  nombre: string;
  movimientos: MovimientoDeSalario[];
  /** El salario de hoy, si sigue activo. Para quien no tiene movimientos en el catálogo (sembrado sin bitácora). */
  actual: { monto: number; moneda: string } | null;
}

/**
 * Los salarios del catálogo, por persona: juntando los movimientos de todos sus costos de salario (el nombre del costo
 * cambia con el puesto: se ata por `teamMemberId`, igual que el calendario). Un salario sin persona no entra.
 */
export async function cargarSalariosPorPersona(): Promise<{ personas: Map<string, PersonaConSalario>; sinSalario: number }> {
  const salarios = await prisma.costoRecurrente.findMany({
    where: { categoria: "SALARIO" },
    select: {
      teamMemberId: true,
      nombre: true,
      monto: true,
      moneda: true,
      activo: true,
      finalizadoEl: true,
      teamMember: { select: { name: true } },
      movimientos: { select: { tipo: true, fechaEfectiva: true, monto: true, montoAnterior: true, moneda: true } },
    },
  });
  const personas = new Map<string, PersonaConSalario>();
  let sinSalario = 0;
  for (const sal of salarios) {
    if (!sal.teamMemberId) {
      if (sal.activo && sal.finalizadoEl === null) sinSalario++;
      continue;
    }
    const p = personas.get(sal.teamMemberId) ?? { nombre: sal.teamMember?.name ?? sal.nombre, movimientos: [], actual: null };
    p.movimientos.push(
      ...sal.movimientos.map((m) => ({
        tipo: m.tipo,
        fechaEfectiva: m.fechaEfectiva.toISOString().slice(0, 10),
        monto: Number(m.monto),
        montoAnterior: m.montoAnterior === null ? null : Number(m.montoAnterior),
        moneda: m.moneda as string,
      })),
    );
    if (sal.activo && sal.finalizadoEl === null) p.actual = { monto: Number(sal.monto), moneda: sal.moneda as string };
    personas.set(sal.teamMemberId, p);
  }
  return { personas, sinSalario };
}

/** El salario que regía para la persona ese día; sin movimientos en el catálogo, el de hoy. null = no estaba. */
export function salarioDeLaPersonaEn(p: PersonaConSalario, fechaISO: string): { monto: number; moneda: string } | null {
  return p.movimientos.length > 0 ? salarioVigenteEn(p.movimientos, fechaISO) : p.actual;
}

/**
 * Las quincenas que faltan generar hasta la de hoy: las que no tienen ninguna fila y las que quedaron a medias.
 * `personas` se pasa cuando ya se leyó, para no leer el catálogo dos veces.
 */
export async function quincenasQueFaltanGenerar(
  hoyISO: string,
  personas?: ReadonlyMap<string, PersonaConSalario>,
): Promise<Array<{ periodo: Periodo; quincena: 1 | 2 }>> {
  const [conteos, catalogo] = await Promise.all([
    prisma.pagoPlanilla.groupBy({ by: ["periodo", "quincena"], _count: { _all: true } }),
    personas ? Promise.resolve(personas) : cargarSalariosPorPersona().then((r) => r.personas),
  ]);
  const esperadasEn = (periodo: string, quincena: 1 | 2) => {
    const dia = quincenasDelPeriodo(periodo).find((q) => q.quincena === quincena);
    if (!dia) return 0;
    return [...catalogo.values()].filter((p) => salarioDeLaPersonaEn(p, dia.fechaProgramada) !== null).length;
  };
  const generadas = quincenasGeneradas(
    conteos.map((c) => ({ periodo: c.periodo, quincena: c.quincena, filas: c._count._all })),
    esperadasEn,
  );
  return quincenasPorGenerar(generadas, hoyISO);
}
