/**
 * app/(shell)/escala/tests/page.tsx — LOS TESTS DEL DIAGNÓSTICO DE RENDIMIENTO, del lado de Smarteam (área O, 2026-10-26).
 *
 * Tres pestañas: las PREGUNTAS de cada test (el borrador que se edita y se aprueba antes de que el público lo vea), los
 * INTENTOS por empresa (quién hizo qué área, con qué nivel y si llegó a HubSpot) y la MEDICIÓN (cuántos empiezan,
 * terminan y lo dejan, y en qué pregunta).
 *
 * Quién la ve: quien ve la preventa (los leads del test terminan ahí) y los super admin. Editar y aprobar las preguntas,
 * solo los super admin; lo cuida cada ruta.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { datosDeLaPantalla } from "@/lib/tests-diagnostico/admin-server";
import { SQL_DE_LOS_TESTS } from "@/lib/tests-diagnostico/repositorio-server";
import PantallaDeLosTests from "@/components/escala/tests/PantallaDeLosTests";

export const metadata: Metadata = { title: "Tests del diagnóstico" };

export default async function TestsDelDiagnostico() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const editor = puedeEditarLaEscala(ctx.role);
  const [veLaPreventa, puedeReintentar] = await Promise.all([can(ctx.teamMember, "preventa", "read"), can(ctx.teamMember, "preventa", "write")]);
  if (!editor && !veLaPreventa) redirect("/escala");

  const datos = await datosDeLaPantalla();
  return (
    <div className={SHELL_DEFAULT}>
      <PantallaDeLosTests
        datos={datos}
        editor={editor}
        puedeReintentar={editor || puedeReintentar}
        hubspotEncendido={process.env.TESTS_HUBSPOT_ENABLED === "1"}
        sqlFaltante={datos.sinTablas ? SQL_DE_LOS_TESTS : null}
      />
    </div>
  );
}
