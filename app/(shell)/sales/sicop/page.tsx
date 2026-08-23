/**
 * /sales/sicop — ANÁLISIS DE LICITACIÓN: las licitaciones públicas, leídas e interpretadas.
 *
 * Junta cuatro fuentes en una fila por licitación:
 *   1. El TICKET de HubSpot (pipeline «Gobiernos») — en vivo, porque el equipo trabaja allá.
 *   2. Las NOTAS del scraper, clasificadas — de ahí salen el score y la confianza que ordenan
 *      la tabla, y los datos duros del procedimiento (monto, tipo, fechas límite).
 *   3. La LECTURA de IA guardada (`SicopLectura`) — un caché; se recalcula cuando cambia.
 *   4. Los ARCHIVOS conocidos (`SicopAdjunto`) — el cartel, con su estado de extracción.
 *
 * ⚠ Las notas se leen en CADA carga y no se persisten. HubSpot es su dueño, son 2 llamadas
 * batch para las 45 licitaciones y el parseo es regex (gratis). Guardarlas agregaría un sync
 * que se puede desincronizar sin que nadie lo note; lo único que se cachea es lo caro.
 *
 * Gateada por `ventas.read`; ANALIZAR pide `ventas.write` porque gasta IA.
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { leerNotasDeTickets, leerResponsables, leerTableroSicop, type NotaCruda } from "@/lib/ventas/sicop";
import { leerLecturasGuardadas } from "@/lib/ventas/sicop-analisis";
import { leerAdjuntosGuardados } from "@/lib/ventas/sicop-archivos";
import { resumirNotas, type ResumenDeNotas } from "@/lib/ventas/sicop-notas";
import type { FilaSicop } from "@/lib/ventas/sicop-orden";
import SicopClient from "./SicopClient";

export const dynamic = "force-dynamic";

const RESUMEN_VACIO: ResumenDeNotas = {
  notas: [],
  filtro: null,
  procedimiento: null,
  conTexto: 0,
  archivos: 0,
  incompletas: 0,
};

export default async function SicopPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");
  const puedeAnalizar = await can(ctx.teamMember, "ventas", "write");

  const tablero = await leerTableroSicop();
  const ids = tablero.etapas.flatMap((e) => e.licitaciones.map((l) => l.id));

  /* Las notas y los owners salen de HubSpot; las lecturas y los archivos, de la base. Van en
     paralelo: son cuatro esperas independientes y encadenarlas duplicaría el tiempo de carga. */
  const [notasPorTicket, autores, guardadas, adjuntos] = await Promise.all([
    (async () => {
      if (ids.length === 0) return new Map<string, NotaCruda[]>();
      try {
        return await leerNotasDeTickets(await getSystemHubspotClient(), ids);
      } catch {
        /* Sin notas la pantalla sigue sirviendo: se pierden el score y los datos del
           procedimiento, no la lista. Romper todo por esto sería peor. */
        return new Map<string, NotaCruda[]>();
      }
    })(),
    (async () => {
      try {
        return await leerResponsables(await getSystemHubspotClient());
      } catch {
        return new Map<string, string>();
      }
    })(),
    leerLecturasGuardadas(ids),
    leerAdjuntosGuardados(ids),
  ]);

  const filas: FilaSicop[] = tablero.etapas.flatMap((etapa) =>
    etapa.licitaciones.map((l) => {
      const previa = guardadas.porTicket.get(l.id) ?? null;
      const notas = notasPorTicket.get(l.id);
      const resumen = notas ? resumirNotas(notas, autores) : RESUMEN_VACIO;
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
        filtro: resumen.filtro,
        datosDelProcedimiento: resumen.procedimiento,
        notas: resumen.notas,
        archivos: adjuntos.porTicket.get(l.id) ?? [],
        notasIncompletas: resumen.incompletas,
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
        title="Análisis de licitación"
        description="Licitaciones públicas del pipeline «Gobiernos», con lo que dijo el filtro de SICOP y lo que leyó la IA."
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
        esquemaAtrasado={guardadas.esquemaAtrasado}
        esquemaDeArchivosAtrasado={adjuntos.esquemaAtrasado}
        puedeAnalizar={puedeAnalizar}
      />
    </div>
  );
}
