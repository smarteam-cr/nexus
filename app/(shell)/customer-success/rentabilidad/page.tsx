import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { cargarCargaDelEquipo } from "@/lib/carga/queries";
import { sinReunionesRecientes } from "@/lib/carga/senales";
import { cargarPipelineParaContratar, cargarRentabilidad } from "@/lib/rentabilidad/queries";
import type { Periodo } from "@/lib/rentabilidad/margen";
import Rentabilidad from "@/components/rentabilidad/Rentabilidad";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

const PERIODOS: Periodo[] = ["mes", "trimestre", "anio"];

// RENTABILIDAD — el margen de cada cuenta con sus horas reales y cuándo contratar (2026-10-06). De la CSL y de dirección,
// como el resto de Éxito del cliente (decisión de Elías): usa la planilla del período SUMADA para el costo de la hora,
// nunca lo que cobra una persona. Lo vigila lib/auth/customer-success-propio.test.ts.
export default async function RentabilidadPage({ searchParams }: { searchParams: Promise<{ periodo?: string; vista?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !esLiderDeCs(ctx.role)) redirect("/clients");

  const sp = await searchParams;
  const periodo = PERIODOS.includes(sp.periodo as Periodo) ? (sp.periodo as Periodo) : "trimestre";
  const ahora = new Date();
  const [datos, carga, pipeline] = await Promise.all([cargarRentabilidad(periodo, ahora), cargarCargaDelEquipo(ahora), cargarPipelineParaContratar()]);
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
        base: carga.equipo.horas + carga.sinCse.horas,
        sinCse: carga.sinCse.horas,
        capacidad: activos.reduce((a, p) => a + p.disponible, 0),
        horasPorCse: config.capacidad.horasContrato * config.capacidad.productiva,
        personas: activos.length,
        fueraDeLaCapacidad: cse.filter((p) => !activos.includes(p)).map((p) => p.nombre),
        tratos: pipeline.tratos,
        error: pipeline.error,
      }}
      config={config}
      hoyISO={new Date(+ahora - 6 * 3_600_000).toISOString().slice(0, 10)}
      pestanaInicial={sp.vista === "contratacion" ? "contratacion" : "margen"}
      contenedor={SHELL_DEFAULT}
    />
  );
}
