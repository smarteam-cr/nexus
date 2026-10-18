import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { veRentabilidad, veSuCarga } from "@/lib/rentabilidad/acceso";
import { RUTA_DE_TU_CARGA } from "@/lib/carga/rutas";
import { cargarCargaDelEquipo } from "@/lib/carga/queries";
import { sinReunionesRecientes } from "@/lib/carga/senales";
import { cargarPipelineParaContratar, cargarRentabilidadConFotos } from "@/lib/rentabilidad/queries";
import { leerDecisionesDeContratacion } from "@/lib/rentabilidad/decisiones";
import { cargarMetaYPorFacturar } from "@/lib/finanzas/meta-server";
import { cargarLecturaDeLosNumeros } from "@/lib/rentabilidad/lectura/servidor";
import type { Periodo } from "@/lib/rentabilidad/margen";
import Rentabilidad from "@/components/rentabilidad/Rentabilidad";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

const PERIODOS: Periodo[] = ["mes", "trimestre", "anio"];

// RENTABILIDAD — el margen de cada cuenta con sus horas reales, el costo de la hora y cuándo contratar (2026-10-06). Solo
// dirección (decisión de Elías del 2026-10-07): muestra el costo de la hora de cada persona, sacado de la planilla. Quien
// lleva cuentas va a «Tu carga». Lo vigila lib/rentabilidad/acceso.test.ts.
export default async function RentabilidadPage({ searchParams }: { searchParams: Promise<{ periodo?: string; vista?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !veRentabilidad(ctx.role)) redirect(ctx && veSuCarga(ctx.role) ? RUTA_DE_TU_CARGA : "/clients");

  const sp = await searchParams;
  const periodo = PERIODOS.includes(sp.periodo as Periodo) ? (sp.periodo as Periodo) : "trimestre";
  const ahora = new Date();
  const hoyISO = new Date(+ahora - 6 * 3_600_000).toISOString().slice(0, 10);
  const [datos, carga, pipeline, decisiones, meta, lectura] = await Promise.all([
    cargarRentabilidadConFotos(periodo, ahora),
    cargarCargaDelEquipo(ahora),
    cargarPipelineParaContratar(),
    leerDecisionesDeContratacion(),
    cargarMetaYPorFacturar(hoyISO),
    cargarLecturaDeLosNumeros(ahora),
  ]);
  const config = carga.configuracion.config;
  // La capacidad es la de quien está trabajando cuentas: quien no aparece en el calendario hace semanas (otra tarea,
  // vacaciones) no es espacio, igual que en la carga del equipo. Se dice quién quedó afuera.
  const lunesActual = carga.futuras[0]?.lunes ?? carga.hoy;
  const cse = carga.personas.filter((p) => !p.esCsl);
  const activos = cse.filter((p) => !sinReunionesRecientes(p, lunesActual));
  return (
    <Rentabilidad
      datos={datos}
      contratacion={{
        base: carga.equipo.horas + carga.sinCse.horasFueraDelEquipo,
        sinCse: carga.sinCse.horasFueraDelEquipo,
        capacidad: activos.reduce((a, p) => a + p.disponible, 0),
        horasPorCse: config.capacidad.horasContrato * config.capacidad.productiva,
        personas: activos.length,
        fueraDeLaCapacidad: cse.filter((p) => !activos.includes(p)).map((p) => p.nombre),
        tratos: pipeline.tratos,
        error: pipeline.error,
        utilizacionMedida: carga.equipo.utilizacion,
        semanasMedidas: carga.semanas.length,
        decisiones,
      }}
      config={config}
      hoyISO={hoyISO}
      meta={meta}
      lectura={lectura}
      pestanaInicial={sp.vista === "contratacion" ? "contratacion" : sp.vista === "costo" ? "costo" : sp.vista === "lectura" ? "lectura" : "margen"}
      contenedor={SHELL_DEFAULT}
    />
  );
}
