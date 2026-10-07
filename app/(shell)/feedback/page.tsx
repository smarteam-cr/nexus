/**
 * app/(shell)/feedback/page.tsx — lo que el equipo reporta desde cualquier pantalla (2026-10-04).
 *
 * Cuatro vistas en la misma ruta (`?vista=`): la Bandeja (cada reporte con su captura y qué se hace con él),
 * la Hoja de ruta (los temas, por columna), Personas (quién reporta, quién no, qué pantallas) y Encuestas (lo que
 * le preguntas al equipo: las preguntas que escribe dirección y las automáticas, «¿cuánto te tomó?», un módulo propio
 * que Feedback configura: lib/tiempos; la clase va en `?clase=`). Es de dirección (SUPER_ADMIN): a cualquier otra persona la manda a «Para ti», donde le llegan
 * las respuestas.
 *
 * Diseño: «Feedback · rediseño completo» (Claude Design, 2026-10-06). Cada pestaña pinta su esqueleto entero
 * (components/feedback/admin/Disposicion.tsx): el panel de la derecha depende de lo que se eligió adentro.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { cuentasDeLasPestanas, datosDeBandeja, datosDeEncuestas, datosDePersonas, feedbackDisponible, temasDeLaHoja } from "@/lib/feedback/queries";
import { enlaceAlTema, esRevisorDeFeedback } from "@/lib/feedback/reglas";
import { SQL_DEL_FEEDBACK } from "@/lib/feedback/http";
import PestanasDeFeedback, { type Vista } from "@/components/feedback/admin/PestanasDeFeedback";
import BandejaDeFeedback from "@/components/feedback/admin/BandejaDeFeedback";
import HojaDeRuta from "@/components/feedback/admin/HojaDeRuta";
import PersonasDeFeedback from "@/components/feedback/admin/PersonasDeFeedback";
import EncuestasDeFeedback from "@/components/feedback/admin/EncuestasDeFeedback";
import { datosDeTiempos, leerPeriodo } from "@/lib/tiempos/resultados";
import { SQL_DE_TIEMPOS, tiemposDisponible } from "@/lib/tiempos/servidor";

export const metadata: Metadata = { title: "Feedback" };

const DESCRIPCION = "Lo que el equipo reporta desde cualquier pantalla de Nexus o desde la escala, y lo que le preguntas. Solo dirección lo ve completo.";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; reporte?: string; tema?: string; periodo?: string; origen?: string; para?: string; clase?: string }>;
}) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  if (!esRevisorDeFeedback(ctx.role)) redirect("/para-ti");

  if (!feedbackDisponible()) {
    return (
      <div className={SHELL_DEFAULT}>
        <div className="space-y-6">
          <PageHeader title="Feedback" description={DESCRIPCION} />
          <Alert variant="warning">
            El feedback todavía no está disponible: falta aplicar {SQL_DEL_FEEDBACK} y reiniciar con el cliente de Prisma nuevo.
          </Alert>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  // «Encuestas» se llamaba «Tiempos» hasta el 2026-10-06: los enlaces viejos la siguen abriendo.
  const vista: Vista =
    sp.vista === "hoja" ? "hoja" : sp.vista === "personas" ? "personas" : sp.vista === "encuestas" || sp.vista === "tiempos" ? "encuestas" : "bandeja";
  const dias = sp.periodo === "90" ? 90 : sp.periodo === "todo" ? null : 30;
  const conTiempos = vista === "encuestas" && tiemposDisponible();

  const [cuentas, bandeja, temas, personas, encuestas, tiempos] = await Promise.all([
    cuentasDeLasPestanas(),
    vista === "bandeja" ? datosDeBandeja() : null,
    vista === "hoja" ? temasDeLaHoja() : null,
    vista === "personas" ? datosDePersonas(dias) : null,
    vista === "encuestas" ? datosDeEncuestas() : null,
    conTiempos ? datosDeTiempos(leerPeriodo(sp.periodo)) : null,
  ]);

  // Un reporte que ya está en la hoja de ruta vive en su tema (2026-10-06): los enlaces viejos a la Bandeja —un
  // aviso de «Para ti», por ejemplo— lo abren ahí.
  const pedido = bandeja && sp.reporte ? bandeja.reportes.find((r) => r.id === sp.reporte) : undefined;
  if (pedido?.estado === "en_hoja") redirect(enlaceAlTema(pedido));

  const encabezado = (
    <div className="space-y-4">
      <PageHeader className="mb-0" title="Feedback" description={DESCRIPCION} recorrido="feedback" />
      <PestanasDeFeedback vista={vista} cuentas={cuentas} />
    </div>
  );

  if (bandeja) {
    return (
      <BandejaDeFeedback
        encabezado={encabezado}
        datos={bandeja}
        reporteInicial={sp.reporte ?? null}
        // Desde el botón «Feedback» de la escala: solo lo mandado desde ahí (2026-10-05).
        origenInicial={sp.origen === "escala" ? "escala" : sp.origen === "pantallas" ? "pantallas" : "todos"}
      />
    );
  }
  if (temas) {
    return (
      <HojaDeRuta
        key={`${sp.tema ?? ""}:${sp.reporte ?? ""}`}
        encabezado={encabezado}
        temas={temas}
        temaInicial={sp.tema ?? null}
        reporteInicial={sp.reporte ?? null}
      />
    );
  }
  if (personas) return <PersonasDeFeedback encabezado={encabezado} datos={personas} periodo={dias === null ? "todo" : String(dias)} />;
  return (
    <EncuestasDeFeedback
      encabezado={encabezado}
      datos={encuestas!}
      tiempos={tiempos}
      faltaElSqlDeTiempos={!conTiempos ? SQL_DE_TIEMPOS : null}
      paraInicial={(sp.para ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)}
      // Las automáticas («¿cuánto te tomó?») van aparte; un enlace viejo a «Tiempos» las abre.
      claseInicial={sp.clase === "automaticas" || sp.vista === "tiempos" ? "automaticas" : "preguntas"}
    />
  );
}
