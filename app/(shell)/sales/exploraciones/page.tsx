/**
 * /sales/exploraciones — las exploraciones de venta: un lienzo por empresa para preparar y guiar las
 * dos reuniones con el prospecto y llegar a la primera propuesta (lib/exploraciones).
 *
 * Gateada por `ventas.read`; abrir y editar pide `ventas.write`.
 */
import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import ListaDeExploraciones from "@/components/exploraciones/ListaDeExploraciones";
import LlegaronPorElTest from "@/components/exploraciones/LlegaronPorElTest";
import { can } from "@/lib/auth/permissions/engine";
import { requireInternalUser } from "@/lib/auth/supabase";
import { escalaParaExplorar, listarExploraciones, SQL_DE_EXPLORACIONES } from "@/lib/exploraciones/servidor";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function ExploracionesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");
  const puedeEditar = await can(ctx.teamMember, "ventas", "write");

  const escala = await escalaParaExplorar();
  const lista = await listarExploraciones(escala.estado === "ok" ? escala.general : null);
  // El test de marketing nombra el área por su id general: se muestra con el nombre de la escala.
  const nombresDeAreas = escala.estado === "ok" ? Object.fromEntries(escala.general.areas.map((a) => [a.id, a.nombre])) : {};

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Exploraciones"
        description="El lienzo de cada prospecto: prepara las dos reuniones, estima su nivel en la escala y llega a la propuesta con sus metas en cifras."
        crumbs={[{ label: "Ventas", href: "/business-cases" }, { label: "Exploraciones" }]}
      />
      {escala.estado !== "ok" && (
        <Alert variant="warning" title="La escala no está publicada en Nexus" className="mb-4">
          Sin ella el lienzo no puede mostrar las dimensiones ni calcular el nivel. Se publica desde la sección Escala.
        </Alert>
      )}
      {lista.estado === "sin-tablas" ? (
        <Alert variant="warning" title="Falta preparar la base">
          Hay que aplicar {SQL_DE_EXPLORACIONES} y reiniciar el servidor.
        </Alert>
      ) : (
        <>
          <LlegaronPorElTest nombresDeAreas={nombresDeAreas} puedeEditar={puedeEditar} />
          <ListaDeExploraciones filas={lista.filas} puedeEditar={puedeEditar} />
        </>
      )}
    </div>
  );
}
