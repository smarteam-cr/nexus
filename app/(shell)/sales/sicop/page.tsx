/**
 * /sales/sicop — LICITACIONES PÚBLICAS, leídas e interpretadas.
 *
 * Las licitaciones del Estado no son tratos: son tickets del pipeline «Gobiernos» del CRM,
 * alimentado por un scraper de SICOP. El título trae el objeto de la contratación y las
 * NOTAS traen lo que de verdad decide si vale la pena — requisitos de admisibilidad, forma
 * de cotizar, garantías, tecnología obligatoria. Esta pantalla junta las tres piezas:
 *
 *   1. HubSpot en vivo (no hay espejo: el equipo trabaja allá y HubSpot manda la etapa),
 *   2. la lectura de IA guardada en `SicopLectura` (un caché; se recalcula cuando cambia),
 *   3. filtros y orden que elige quien mira (decisión de Elías: los cinco criterios de
 *      prioridad son opciones de pantalla, no una regla escondida en el código).
 *
 * Gateada por `ventas.read`; ANALIZAR pide `ventas.write` porque gasta IA.
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { leerTableroSicop } from "@/lib/ventas/sicop";
import { leerLecturasGuardadas } from "@/lib/ventas/sicop-analisis";
import type { FilaSicop } from "@/lib/ventas/sicop-orden";
import SicopClient from "./SicopClient";

export const dynamic = "force-dynamic";

export default async function SicopPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");
  const puedeAnalizar = await can(ctx.teamMember, "ventas", "write");

  const tablero = await leerTableroSicop();

  const ids = tablero.etapas.flatMap((e) => e.licitaciones.map((l) => l.id));
  const guardadas = await leerLecturasGuardadas(ids);

  const filas: FilaSicop[] = tablero.etapas.flatMap((etapa) =>
    etapa.licitaciones.map((l) => {
      const previa = guardadas.porTicket.get(l.id) ?? null;
      return {
        id: l.id,
        asunto: l.asunto,
        detalle: l.detalle,
        procedimiento: l.procedimiento,
        tipoContratacion: l.tipoContratacion,
        formatoEvaluacion: l.formatoEvaluacion,
        fechaAclaraciones: l.fechaAclaraciones,
        motivoPerdida: l.motivoPerdida,
        responsable: l.responsable,
        creadaEl: l.creadaEl,
        actualizadaEl: l.actualizadaEl,
        presupuestoCrm: l.presupuesto,
        etapa: { id: etapa.id, label: etapa.label, orden: etapa.orden, cerrada: etapa.cerrada },
        lectura: previa?.lectura ?? null,
        /* Señal barata: el ticket se tocó después de leerlo. Quien decide si hay que gastar
           IA de nuevo es la corrida, comparando la huella del TEXTO — ver FilaSicop. */
        movidoDespues:
          !!previa?.lectura.analizadoEl &&
          !!l.actualizadaEl &&
          l.actualizadaEl > previa.lectura.analizadoEl,
      };
    }),
  );

  const etapas = tablero.etapas.map((e) => ({
    id: e.id,
    label: e.label,
    orden: e.orden,
    cerrada: e.cerrada,
  }));

  const enJuego = filas.filter((f) => !f.etapa.cerrada).length;

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="SICOP"
        description="Licitaciones públicas del pipeline «Gobiernos», leídas con IA para poder priorizar."
        crumbs={[{ label: "Ventas", href: "/business-cases" }, { label: "SICOP" }]}
        action={
          <div className="text-right">
            <p className="text-xl font-semibold text-fg tabular-nums">{enJuego}</p>
            <p className="text-2xs uppercase tracking-widest text-fg-muted">
              en juego · {filas.length} en total
            </p>
          </div>
        }
      />
      <SicopClient
        filas={filas}
        etapas={etapas}
        soportado={tablero.soportado}
        errorHubspot={tablero.error}
        portalId={tablero.portalId}
        tablaAusente={guardadas.tablaAusente}
        puedeAnalizar={puedeAnalizar}
      />
    </div>
  );
}
