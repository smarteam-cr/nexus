import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/ui";
import {
  requireUser,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/auth/supabase";
import { accessibleClientWhere, sharedClientIdsFor } from "@/lib/auth/access";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { can } from "@/lib/auth/permissions/engine";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { cn } from "@/lib/cn";
import NuevoProyectoStepper from "@/components/projects/NuevoProyectoStepper";
import { ClientsTable, ClientsTableZoneSkeleton, PanelDeLaCartera, PanelDeLaCarteraSkeleton } from "./ClientsTable";
import PanelLateral from "@/components/ui/PanelLateral";

// Render dinámico — la página depende del usuario logueado (sesión Supabase
// vía cookies), así que no puede cachearse con ISR como antes.
export const dynamic = "force-dynamic";

/**
 * /clients — SHELL RÁPIDO + zona suspendida ("push dynamic access down").
 *
 * Esta page resuelve solo lo barato (auth + rol + count) y pinta el header real de
 * inmediato; las queries pesadas (clients + team + meeting-dates + actividad) viven en
 * <ClientsTable>, suspendida con su skeleton. Desde el 2026-10-04 todos los roles ven el filtro
 * «De quién es», así que el skeleton es uno solo (antes cambiaba por rol).
 */
export default async function ClientsPage() {
  // Identidad del usuario logueado (Supabase Auth + AppUser).
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/");
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  // Shape compatible con el viejo ActiveCse para el ClientsGrid client component.
  const roleEnum = user.teamMember?.roleEnum;
  const activeCse = {
    email: user.email,
    name: user.teamMember?.name ?? user.email,
    role: roleEnum ?? "Miembro",
    isSuperAdmin: roleEnum === "SUPER_ADMIN",
    // Permiso EFECTIVO "ve todo" (default VENTAS/DEV/CSL/MARKETING/SA) → el índice
    // abre en "Todos" y reordena las pestañas. CSE (sin el permiso) queda igual que siempre.
    canSeeAll: user.teamMember ? await can(user.teamMember, "clientes", "viewAll") : false,
  };

  // Filtro de acceso server-side: CSE ve solo sus clientes (owner) + compartidos;
  // roles con visibilidad total → null (sin filtro). Ya no es cosmético en el browser.
  // sharedIds = los compartidos con él (GRANT) → alimenta la pestaña "Compartidos conmigo".
  //
  // `kinds: "all"` es EXCLUSIVO de esta pantalla: es la única donde se re-clasifica una
  // empresa, así que tiene que poder ver a los aliados/internos/prospectos para sacarlos
  // de la cartera. Las pestañas de categoría separan lo que es cliente de lo que no.
  const [clientWhere, sharedIds] = await Promise.all([
    accessibleClientWhere(user, { kinds: "all" }),
    sharedClientIdsFor(user),
  ]);

  // Counts baratos para la descripción del header (la lista completa llega por streaming).
  //
  // Van los DOS: el header decía "155 clientes" mientras las pestañas de abajo sumaban 165, y
  // nada explicaba los 10 de diferencia (prospectos, aliados y las empresas que somos
  // nosotros). Con los dos números el salto queda dicho en vez de quedar como un misterio.
  const [empresaCount, clientCount] = await Promise.all([
    prisma.client.count({ where: clientWhere ?? {} }),
    prisma.client.count({ where: { AND: [clientWhere ?? {}, { ...CS_CLIENT_WHERE }] } }),
  ]);

  /* Dos columnas, como el listado de la preventa (sistema «Nexus · interfaz interna», rediseño
     del 2026-10-04): a la izquierda la cartera; a la derecha «Qué sigue», lo que necesita atención
     y la bandeja de HubSpot. En pantallas angostas el panel baja al final.
     ⚠ Las dos zonas reciben el MISMO `clientWhere` y el MISMO `sharedIds`: es lo que hace que
     `consultarIndice` (con `cache()`) corra una sola vez para las dos. */
  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <main className={cn(SHELL_DEFAULT, "min-w-0 flex-1 pb-12")}>
        <PageHeader recorrido="clientes-listado"
          className="mb-5"
          title="Clientes"
          description={
            empresaCount === 0
              ? "Sin empresas aún"
              : `${empresaCount} empresa${empresaCount !== 1 ? "s" : ""} · ` +
                `${clientCount} cliente${clientCount !== 1 ? "s" : ""}. ` +
                "Abre una para ver sus proyectos, sus documentos y su información."
          }
          /* El único botón azul de la pantalla. «Traer de HubSpot» dejó de ser un botón con modal:
             es la bandeja del panel de la derecha. */
          action={<NuevoProyectoStepper />}
        />

        <Suspense fallback={<ClientsTableZoneSkeleton showPills />}>
          <ClientsTable
            user={user}
            activeCse={activeCse}
            clientWhere={clientWhere}
            sharedIds={sharedIds}
          />
        </Suspense>
      </main>
      <PanelLateral etiqueta="Cartera" ancho="lg:w-[340px]">
        <Suspense fallback={<PanelDeLaCarteraSkeleton />}>
          <PanelDeLaCartera
            user={user}
            activeCse={activeCse}
            clientWhere={clientWhere}
            sharedIds={sharedIds}
          />
        </Suspense>
      </PanelLateral>
    </div>
  );
}
