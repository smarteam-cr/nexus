/**
 * /sales/exploraciones/[id] — el lienzo de la exploración de venta de una empresa.
 *
 * El servidor lee la exploración y la escala PUBLICADA (con la edición y el perfil de la
 * exploración) y le baja al lienzo solo lo que usa (lib/exploraciones/escala-del-lienzo.ts).
 * Gateada por `ventas.read`; editar pide `ventas.write`.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import LienzoDeExploracion from "@/components/exploraciones/LienzoDeExploracion";
import { can } from "@/lib/auth/permissions/engine";
import { requireInternalUser } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import { hubspotCompanyUrl } from "@/lib/hubspot/urls";
import {
  escalaDeLaExploracion,
  escalaParaExplorar,
  leerExploracion,
  SQL_DE_EXPLORACIONES,
} from "@/lib/exploraciones/servidor";
import { paraLaPantallaCompleta } from "@/lib/exploraciones/pantalla";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function ExploracionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");
  const puedeEditar = await can(ctx.teamMember, "ventas", "write");

  const crumbs = [
    { label: "Ventas", href: "/business-cases" },
    { label: "Exploraciones", href: "/sales/exploraciones" },
  ];

  const lectura = await leerExploracion(id);
  if (lectura.estado === "no-existe") notFound();
  if (lectura.estado === "sin-tablas") {
    return (
      <div className={SHELL_DEFAULT}>
        <PageHeader title="Exploración" crumbs={[...crumbs, { label: "Exploración" }]} />
        <Alert variant="warning" title="Falta preparar la base">
          Hay que aplicar {SQL_DE_EXPLORACIONES} y reiniciar el servidor.
        </Alert>
      </div>
    );
  }

  const exp = await paraLaPantallaCompleta(lectura.fila);
  const escala = await escalaParaExplorar();
  const portal = await prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { hubspotPortalId: true } });
  const empresaUrl = hubspotCompanyUrl(portal?.hubspotPortalId ?? null, exp.empresa.hubspotCompanyId);

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title={exp.empresa.nombre}
        description={
          escala.estado === "ok"
            ? `Exploración de venta · ${escalaDeLaExploracion(escala.general, exp.estado).edicion?.nombre ?? "Escala general"}${exp.estado.archivada ? " · archivada" : ""}`
            : "Exploración de venta"
        }
        crumbs={[...crumbs, { label: exp.empresa.nombre }]}
        action={
          empresaUrl ? (
            <Link href={empresaUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-light hover:underline">
              Ver en HubSpot
            </Link>
          ) : undefined
        }
      />
      {escala.estado !== "ok" ? (
        <Alert variant="warning" title="La escala no está publicada en Nexus">
          Sin ella el lienzo no puede mostrar las dimensiones ni calcular el nivel. Se publica desde la sección Escala.
        </Alert>
      ) : (
        <>
          {escala.aviso && (
            <Alert variant="warning" className="mb-4">
              {escala.aviso}
            </Alert>
          )}
          <LienzoDeExploracion
            inicial={exp}
            escala={escalaDeLaExploracion(escala.general, exp.estado)}
            puedeEditar={puedeEditar && !exp.estado.archivada}
          />
        </>
      )}
    </div>
  );
}
