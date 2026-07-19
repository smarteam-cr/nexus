/**
 * lib/ui/breadcrumbs.ts — derivación del crumb de MÓDULO desde el nav-config.
 *
 * Diseño híbrido a propósito: el primer crumb (el módulo) sale SOLO de APP_NAV
 * (gratis y siempre consistente con el sidebar); los crumbs profundos (nombre del
 * cliente, título del BC) los pasa cada página, que ya tiene el dato server-side.
 * Derivarlos automáticamente exigiría un registry de fetchers por entidad que hoy
 * no paga su costo.
 */
import { APP_NAV } from "@/components/layout/nav-config";
import type { Crumb } from "@/components/ui/Breadcrumbs";

/** El crumb del módulo dueño de un pathname (por `match` del nav-config), o null. */
export function moduleCrumb(pathname: string): Crumb | null {
  for (const item of APP_NAV) {
    if ((item.match ?? [item.href]).some((p) => pathname.startsWith(p))) {
      return { label: item.label, href: item.href };
    }
  }
  return null;
}
