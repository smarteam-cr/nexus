/**
 * lib/invariantes/smartloop.ts — los invariantes de SMARTLOOP (paso dos del roadmap, área M, 2026-10-25).
 */
import { PROJECT_PIPELINES } from "@/lib/projects/kind";
import { TIPO_TEMPORAL } from "@/lib/servicios/tipo-de-servicio";
import { cumple, viola, type Invariante } from "./contrato";

/**
 * ⚠ INV55 nace «no bloquea» (2026-10-25): el día que se escribió, 5 de los 7 proyectos del pipeline SmartLoop tenían
 * `proyecto_temporal`. Se arregla con el deploy (el espejo deja de escribirlo: lib/servicios/tipo-de-servicio.ts) y
 * `scripts/smartloop-tipo-de-servicio.ts --apply`. Avisa sin poner el semáforo en rojo hasta su primer verde; ese día se
 * cambia esta línea a `true` (el patrón de INV47).
 */
export const INV55_BLOQUEA = false;

const lista = (xs: string[], max = 8) => xs.slice(0, max).map((x) => `    · ${x}`).join("\n") + (xs.length > max ? `\n    · y ${xs.length - max} más` : "");

/**
 * INV55 · Ningún proyecto ACTIVO de un pipeline de servicio recurrente (SmartLoop) dice ser un «proyecto temporal». Un
 * SmartLoop con `proyecto_temporal` le hacía decir al kickoff que era un proyecto que se entrega una vez (RC
 * Inmobiliaria, 2026-10-23); el kickoff ya lee el servicio, pero el dato sigue llegando a las corridas y a quien lo lea.
 */
export const INV55: Invariante = {
  id: "55",
  nombre: "ningún proyecto de SmartLoop dice ser un proyecto temporal",
  async correr(db) {
    const pipelines = PROJECT_PIPELINES.filter((p) => p.servicioRecurrente).map((p) => p.hubspotPipelineId);
    const mal = await db.project.findMany({
      where: { status: "active", hubspotPipelineId: { in: [...pipelines] }, serviceType: TIPO_TEMPORAL },
      select: { id: true, name: true, client: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    if (!mal.length) return cumple("✓ INV55: ningún proyecto de SmartLoop tiene «proyecto_temporal».");
    const titular = `${mal.length} ${mal.length === 1 ? "proyecto de SmartLoop dice" : "proyectos de SmartLoop dicen"} ser «proyecto_temporal»`;
    const detalle = lista(mal.map((p) => `${p.client?.name ?? "?"} › ${p.name} (${p.id})`));
    const remedio = "    Remedio: después del deploy, `npx tsx scripts/smartloop-tipo-de-servicio.ts` (simulacro) y con `--apply` lo deja vacío.";
    if (!INV55_BLOQUEA) return cumple(`⚠ INV55 (no bloquea hasta su primer verde): ${titular}.`, detalle, remedio);
    return viola(`✗ INV55 VIOLADO: ${titular}.`, detalle, remedio);
  },
};
