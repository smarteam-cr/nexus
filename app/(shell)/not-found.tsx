/**
 * app/(shell)/not-found.tsx — el 404 de las pantallas internas, con el menú (2026-10-06).
 *
 * Lo pintan dos caminos: una ficha que llama a `notFound()` (un cliente, una propuesta, un documento
 * de Roles que no existe o no está compartido contigo) y una dirección que no existe
 * (app/(shell)/[...ruta]/page.tsx). Sin esa ruta, Next pintaría su propio 404, en inglés y sin menú.
 *
 * Acá solo se arma el menú que la persona puede abrir, con las mismas reglas del Sidebar
 * (`canSeeNavItem`, `visibleNavChildren`): de ahí salen las sugerencias y el botón azul. Qué decir lo
 * decide la pantalla, que es la que conoce la dirección (components/no-encontrada/PaginaNoEncontrada).
 * Si armar el menú falla, el 404 sale igual, sin sugerencias: una página de error no puede romperse.
 */
import { requireUser } from "@/lib/auth/supabase";
import { getEffectivePermissions } from "@/lib/auth/permissions/engine";
import type { PermissionMap } from "@/lib/auth/permissions/types";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { esAdminDeRoles, hasSharedRoleDocs } from "@/lib/roles/access";
import { vistaFinanzasDe } from "@/lib/finanzas/vista";
import { APP_NAV, canSeeNavItem, visibleNavChildren } from "@/components/layout/nav-config";
import PaginaNoEncontrada, { type DestinoConIcono } from "@/components/no-encontrada/PaginaNoEncontrada";

/** El menú que esta persona puede abrir, aplanado: cada ítem y sus hijos visibles (con el ícono del padre). */
async function menuQuePuedeAbrir(): Promise<DestinoConIcono[]> {
  const user = await requireUser();
  const tm = user.teamMember;
  const isSuperAdmin = tm?.roleEnum === "SUPER_ADMIN";
  const permissions: PermissionMap = tm ? await getEffectivePermissions(tm) : { v: 1, sections: {} };
  // Mismo criterio que AppShell para el ítem de Roles.
  const hasSharedDocs =
    isSuperAdmin || !tm ? false : esAdminDeRoles({ role: tm.roleEnum }) || (await hasSharedRoleDocs(tm.id));
  const ctx = { isSuperAdmin, permissions, hasSharedDocs, role: tm?.roleEnum ?? null };
  const hijosCtx = {
    isCostos: isCostosRole(tm?.roleEnum),
    vista: vistaFinanzasDe({ roleEnum: tm?.roleEnum, vistaFinanzas: tm?.vistaFinanzas }),
    permissions,
  };

  const destinos: DestinoConIcono[] = [];
  for (const item of APP_NAV) {
    if (!canSeeNavItem(item, ctx)) continue;
    destinos.push({ etiqueta: item.label, href: item.href, icono: item.icon });
    for (const hijo of visibleNavChildren(item, hijosCtx)) {
      destinos.push({ etiqueta: hijo.label, href: hijo.href, padre: item.label, icono: item.icon });
    }
  }
  return destinos;
}

export default async function NoEncontrada() {
  const destinos = await menuQuePuedeAbrir().catch(() => []);
  return <PaginaNoEncontrada destinos={destinos} />;
}
