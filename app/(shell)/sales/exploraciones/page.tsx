/**
 * /sales/exploraciones — Preventa: un lienzo por empresa para preparar y guiar las reuniones con el
 * prospecto y llegar a la primera propuesta (lib/exploraciones). El nombre visible es «Preventa»
 * desde el 2026-10-03; la dirección y el modelo siguen diciendo «exploraciones» (identidad, no copy).
 *
 * Dos columnas, como el tablero del listado (sistema de diseño «Nexus · interfaz interna»): a la
 * izquierda, las preventas en curso y, debajo, «Planificar con una empresa» (el HubSpot de Smarteam
 * con su buscador); a la derecha, «Qué sigue» y «Llegaron por el test», la bandeja de entrada. En
 * pantallas angostas el panel baja al final.
 *
 * Gateada por `ventas.read`; abrir y editar pide `ventas.write`.
 */
import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import EmpresasDeHubspot from "@/components/exploraciones/EmpresasDeHubspot";
import ListaDeExploraciones from "@/components/exploraciones/ListaDeExploraciones";
import LlegaronPorElTest from "@/components/exploraciones/LlegaronPorElTest";
import { can } from "@/lib/auth/permissions/engine";
import { requireInternalUser } from "@/lib/auth/supabase";
import { cn } from "@/lib/cn";
import { equipoParaLaPreventa, escalaParaExplorar, listarExploraciones, SQL_DE_EXPLORACIONES } from "@/lib/exploraciones/servidor";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import PanelLateral from "@/components/ui/PanelLateral";

export const dynamic = "force-dynamic";

export default async function ExploracionesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "preventa", "read"))) redirect("/clients");
  const puedeEditar = await can(ctx.teamMember, "preventa", "write");

  const escala = await escalaParaExplorar();
  const [lista, equipo] = await Promise.all([listarExploraciones(escala.estado === "ok" ? escala.general : null), equipoParaLaPreventa()]);
  // El test de marketing nombra el área por su id general: se muestra con el nombre de la escala.
  const nombresDeAreas = escala.estado === "ok" ? Object.fromEntries(escala.general.areas.map((a) => [a.id, a.nombre])) : {};

  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <main className={cn(SHELL_DEFAULT, "min-w-0 flex-1")}>
        <PageHeader
          recorrido="preventa-listado"
          title="Preventa"
          description="El lienzo de cada prospecto: prepara cada reunión, ubícalo en la escala y llega a la propuesta con sus metas en cifras."
          crumbs={[{ label: "Ventas", href: "/business-cases" }, { label: "Preventa" }]}
          action={
            <a
              href="#planificar"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Planificar una empresa
            </a>
          }
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
            <ListaDeExploraciones filas={lista.filas} miCorreo={ctx.teamMember.email} equipo={equipo} puedeEditar={puedeEditar} />
            <EmpresasDeHubspot puedeEditar={puedeEditar} />
          </>
        )}
      </main>
      {lista.estado !== "sin-tablas" && (
        <PanelLateral etiqueta="Preventa" ancho="lg:w-[360px]" className="py-8">
          <LlegaronPorElTest nombresDeAreas={nombresDeAreas} puedeEditar={puedeEditar} />
        </PanelLateral>
      )}
    </div>
  );
}
