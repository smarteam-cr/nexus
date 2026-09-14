/**
 * app/(shell)/documentacion/layout.tsx — el armazón de la base de conocimiento.
 *
 * Dos columnas: el árbol de páginas a la izquierda (persiste al navegar entre páginas, como en
 * Notion) y la página a la derecha. En pantallas chicas el árbol se esconde y se abre desde el
 * encabezado de la página.
 *
 * El ancho del árbol lo ajusta cada persona arrastrando su borde; se lee acá de la cookie para que
 * la página nazca con ese ancho (ver `lib/documentacion/ancho-del-arbol.ts`).
 *
 * ⚠ Este layout es PRESENTACIÓN: el guard de cada página va en su propio `page.tsx` (regla del
 * shell). El de acá existe igual porque el árbol ya consulta la base.
 *
 * El árbol va dentro de `<Suspense>`: su consulta no debe demorar el contenido de la página.
 */
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { arbolDePaginas } from "@/lib/documentacion/consultas";
import { abiertosPorPagina } from "@/lib/documentacion/consultas-de-comentarios";
import { COOKIE_ANCHO_DEL_ARBOL, anchoDesdeCookie } from "@/lib/documentacion/ancho-del-arbol";
import { ListSkeleton } from "@/components/ui";
import ArbolDePaginas from "@/components/documentacion/ArbolDePaginas";
import PanelDelArbolAjustable from "@/components/documentacion/PanelDelArbolAjustable";

async function PanelDelArbol({
  puedeEscribir,
  puedeAdministrar,
}: {
  puedeEscribir: boolean;
  puedeAdministrar: boolean;
}) {
  const [arbol, comentariosAbiertos] = await Promise.all([arbolDePaginas(), contarComentariosAbiertos()]);
  return (
    <ArbolDePaginas
      arbol={arbol}
      puedeEscribir={puedeEscribir}
      puedeAdministrar={puedeAdministrar}
      comentariosAbiertos={comentariosAbiertos}
    />
  );
}

/**
 * Los hilos abiertos de cada página, para el contador del árbol. Si falla, el árbol abre igual, sin
 * contadores: un contador no puede dejar a nadie sin la documentación. Pasa en dos casos, y los
 * dos se arreglan afuera del código:
 *   · el código llegó antes que el SQL de comentarios (faltan las tablas);
 *   · un servidor de desarrollo que arrancó antes del `prisma generate` sigue con el cliente viejo
 *     en memoria (el modelo no existe para él) — se arregla reiniciándolo.
 * Va como advertencia y no como error: está atajado, y en desarrollo un `console.error` abre la
 * ventana de errores de Next sobre una página que funciona.
 */
async function contarComentariosAbiertos(): Promise<Record<string, number>> {
  try {
    return await abiertosPorPagina();
  } catch (e) {
    console.warn(
      "[documentacion] sin contadores de comentarios: ¿falta el SQL 2026-09-13-documentacion-comentarios, " +
        "o el servidor arrancó antes del `prisma generate`?",
      e instanceof Error ? e.message : e,
    );
    return {};
  }
}

export default async function LayoutDeDocumentacion({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");

  const [puedeEscribir, puedeAdministrar, galletas] = await Promise.all([
    can(ctx.teamMember, "documentacion", "write"),
    can(ctx.teamMember, "documentacion", "manage"),
    cookies(),
  ]);

  return (
    <div className="flex items-start">
      <PanelDelArbolAjustable
        anchoInicial={anchoDesdeCookie(galletas.get(COOKIE_ANCHO_DEL_ARBOL)?.value)}
      >
        <Suspense fallback={<ListSkeleton rows={6} lines={1} compact />}>
          <PanelDelArbol puedeEscribir={puedeEscribir} puedeAdministrar={puedeAdministrar} />
        </Suspense>
      </PanelDelArbolAjustable>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
