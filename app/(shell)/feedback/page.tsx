/**
 * app/(shell)/feedback/page.tsx — lo que el equipo reporta desde cualquier pantalla (2026-10-04).
 *
 * Tres vistas en la misma ruta (`?vista=`): la Bandeja (cada reporte con su captura y qué se hace con él),
 * la Hoja de ruta (los temas, por columna) y Personas (quién reporta, quién no, qué pantallas). Es de
 * dirección (SUPER_ADMIN): a cualquier otra persona la manda a «Para ti», donde le llegan las respuestas.
 * Diseño: tablero «Feedback · diseño» de Claude Design, tableros 7 a 10.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { datosDeBandeja, datosDePersonas, feedbackDisponible, temasDeLaHoja } from "@/lib/feedback/queries";
import { esRevisorDeFeedback } from "@/lib/feedback/reglas";
import { SQL_DEL_FEEDBACK } from "@/lib/feedback/http";
import PestanasDeFeedback, { type Vista } from "@/components/feedback/admin/PestanasDeFeedback";
import BandejaDeFeedback from "@/components/feedback/admin/BandejaDeFeedback";
import HojaDeRuta from "@/components/feedback/admin/HojaDeRuta";
import PersonasDeFeedback from "@/components/feedback/admin/PersonasDeFeedback";

export const metadata: Metadata = { title: "Feedback" };

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; reporte?: string; periodo?: string; origen?: string }>;
}) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  if (!esRevisorDeFeedback(ctx.role)) redirect("/para-ti");

  const cabecera = (
    <PageHeader title="Feedback" description="Lo que el equipo reporta desde cualquier pantalla de Nexus y lo que comenta en la escala. Solo dirección lo ve completo." />
  );
  if (!feedbackDisponible()) {
    return (
      <div className={SHELL_DEFAULT}>
        <div className="space-y-6">
          {cabecera}
          <Alert variant="warning">
            El feedback todavía no está disponible: falta aplicar {SQL_DEL_FEEDBACK} y reiniciar con el cliente de Prisma nuevo.
          </Alert>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const vista: Vista = sp.vista === "hoja" ? "hoja" : sp.vista === "personas" ? "personas" : "bandeja";
  const dias = sp.periodo === "90" ? 90 : sp.periodo === "todo" ? null : 30;

  const bandeja = vista === "bandeja" ? await datosDeBandeja() : null;
  const temas = vista === "hoja" ? await temasDeLaHoja() : null;
  const personas = vista === "personas" ? await datosDePersonas(dias) : null;

  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-6">
        {cabecera}
        <PestanasDeFeedback vista={vista} />
        {bandeja && (
          <BandejaDeFeedback
            datos={bandeja}
            reporteInicial={sp.reporte ?? null}
            // Desde el botón «Comentarios» de la escala: solo lo comentado ahí (2026-10-05).
            origenInicial={sp.origen === "escala" ? "escala" : sp.origen === "pantallas" ? "pantallas" : "todos"}
          />
        )}
        {temas && <HojaDeRuta temas={temas} />}
        {personas && <PersonasDeFeedback datos={personas} periodo={dias === null ? "todo" : String(dias)} />}
      </div>
    </div>
  );
}
