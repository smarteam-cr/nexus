import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/ui";
import {
  requireUser,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/auth/supabase";
import { accessibleClientWhere, sharedClientIdsFor } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions/engine";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { ClientsTable, ClientsTableZoneSkeleton } from "./ClientsTable";

// Render dinámico — la página depende del usuario logueado (sesión Supabase
// vía cookies), así que no puede cachearse con ISR como antes.
export const dynamic = "force-dynamic";

/**
 * /clients — SHELL RÁPIDO + zona suspendida ("push dynamic access down").
 *
 * Esta page resuelve solo lo barato (auth + rol + count) y pinta el header real de
 * inmediato; las queries pesadas (clients + team + meeting-dates + actividad) viven en
 * <ClientsTable>, suspendida con un fallback que ESTA page elige sabiendo el rol: con
 * pills para CSE, sin pills para SUPER_ADMIN. Así el skeleton de la zona calza exacto
 * con lo que cada rol va a ver — cosa que el loading.tsx estático no puede hacer.
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
  // Acceso al área de Ventas (Business Cases) — mismo gate que /business-cases (ventas.read).
  const canSeeSales = user.teamMember ? await can(user.teamMember, "ventas", "read") : false;
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
  const [clientWhere, sharedIds] = await Promise.all([
    accessibleClientWhere(user),
    sharedClientIdsFor(user),
  ]);

  // Count barato para la descripción del header (la lista completa llega por streaming).
  const clientCount = await prisma.client.count({ where: clientWhere ?? undefined });

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Clientes"
        description={
          clientCount === 0
            ? "Sin clientes aún"
            : `${clientCount} cliente${clientCount !== 1 ? "s" : ""}`
        }
        action={
          canSeeSales ? (
            <Link
              href="/business-cases"
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l4-4 3 3 5-6" />
              </svg>
              Business cases
            </Link>
          ) : undefined
        }
      />

      <Suspense fallback={<ClientsTableZoneSkeleton showPills={!activeCse.isSuperAdmin} />}>
        <ClientsTable
          user={user}
          activeCse={activeCse}
          clientWhere={clientWhere}
          sharedIds={sharedIds}
        />
      </Suspense>
    </div>
  );
}
