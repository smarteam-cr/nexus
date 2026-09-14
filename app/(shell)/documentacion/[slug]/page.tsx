/**
 * app/(shell)/documentacion/[slug]/page.tsx — una página de la base de conocimiento.
 *
 * El servidor decide y baja como props, sin valor por defecto (regla de `controles-sin-permiso`):
 * si esta persona puede editar, si puede administrar, el contenido ya saneado, el índice de
 * páginas para los enlaces «@» y —si la página los usa— los datos de los bloques vivos.
 *
 * Sanear acá, y no en el navegador, es lo que evita que un bloque viejo o escrito a mano deje la
 * página sin abrir.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import {
  paginaPorSlug,
  paginasQueMencionan,
  paginasVivas,
} from "@/lib/documentacion/consultas";
import { migasDe, rutaDe } from "@/lib/documentacion/arbol";
import { sanearBloques } from "@/lib/documentacion/texto";
import { cargarDatosVivos, tieneBloquesVivos } from "@/lib/documentacion/vivos";
import PaginaCliente from "@/components/documentacion/PaginaCliente";
import BarraDeMigas from "@/components/documentacion/BarraDeMigas";
import { IconoDePagina } from "@/components/documentacion/iconos";
import { COLUMNA_DE_PAGINA, INSET_CONTENIDO } from "@/components/documentacion/layout";
import RedirigirAnclaVieja from "@/components/documentacion/RedirigirAnclaVieja";
import { SLUG_DE_INICIO } from "@/lib/documentacion/tipos";
import { puedeResolver } from "@/lib/documentacion/comentarios";
// Solo el TIPO: `import type` se borra al compilar, así que el editor no viaja al servidor.
import type { BloqueParcialDeDocumentacion } from "@/components/documentacion/esquema-editor";

export default async function PaginaDeDocumentacion({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");

  const { slug } = await params;
  const pagina = await paginaPorSlug(slug);
  // Una página archivada, o que ya no existe, no es un callejón sin salida: quien llega justo
  // después de archivarla, desde otra pestaña o por un enlace viejo, vuelve a Inicio.
  if (!pagina || pagina.archivadaAt) redirect("/documentacion");

  const contenido = sanearBloques(pagina.contenido);

  const [puedeEscribir, puedeAdministrar, vivas, vivos, enlazanAca] = await Promise.all([
    can(ctx.teamMember, "documentacion", "write"),
    can(ctx.teamMember, "documentacion", "manage"),
    paginasVivas(),
    tieneBloquesVivos(contenido) ? cargarDatosVivos() : Promise.resolve(null),
    paginasQueMencionan(pagina.id),
  ]);

  // Una página bloqueada se lee igual; editarla es del liderazgo.
  const editable = pagina.bloqueada ? puedeAdministrar : puedeEscribir;

  // De Inicio a esta página, incluida: la barra de arriba.
  const migas = migasDe(pagina.id, vivas, SLUG_DE_INICIO).map((p) => ({
    slug: p.slug,
    titulo: p.titulo,
    icono: p.icono,
  }));

  // `vivas` ya viene ordenada por `orden`: las subpáginas salen en el mismo orden que en el árbol.
  const hijas = vivas.filter((p) => p.parentId === pagina.id);

  return (
    <>
    <BarraDeMigas migas={migas} />
    <div className={SHELL_DEFAULT}>
      {/* Los enlaces viejos del manual (`/documentacion#agentes`) llegan acá por la redirección del
          índice, con su ancla: esto los reenvía a «¿Cómo funciona Nexus?». */}
      {pagina.slug === SLUG_DE_INICIO && <RedirigirAnclaVieja />}
      <div className={COLUMNA_DE_PAGINA}>
        <PaginaCliente
          pagina={{
            id: pagina.id,
            slug: pagina.slug,
            titulo: pagina.titulo,
            icono: pagina.icono,
            bloqueada: pagina.bloqueada,
            fija: pagina.fija,
            version: pagina.version,
          }}
          /* El contenido viaja como JSON plano (así lo guarda la base y así lo sanea el servidor).
             La conversión al tipo del editor se hace ACÁ, en el único punto donde los dos mundos
             se tocan, en vez de repetirla dentro del cliente. */
          contenido={contenido as unknown as BloqueParcialDeDocumentacion[]}
          editable={editable}
          puedeAdministrar={puedeAdministrar}
          /* Comentar es de todo el equipo, en toda página; resolver, de Súper admin y CSL. */
          yo={{ email: ctx.user.email, nombre: ctx.teamMember.name, foto: ctx.teamMember.photoUrl }}
          puedeResolverComentarios={puedeResolver(ctx.role)}
          vivos={vivos}
          paginas={vivas.map((p) => ({
            id: p.id,
            slug: p.slug,
            titulo: p.titulo,
            icono: p.icono,
            /* Dónde vive cada una: en el menú «@» distingue dos páginas con el mismo nombre. */
            ruta: rutaDe(p.id, vivas)
              .slice(0, -1)
              .map((x) => x.titulo),
          }))}
        />

        {/* Las páginas que cuelgan de ésta. En el árbol ya están, pero una página tiene que
            poder recorrerse sola: quien llega por un enlace no mira el panel de la izquierda. */}
        {hijas.length > 0 && (
          <section className={`mt-10 ${INSET_CONTENIDO}`}>
            <h2 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-fg-muted">
              Subpáginas
            </h2>
            <ul>
              {hijas.map((h) => (
                <li key={h.id}>
                  <Link
                    href={`/documentacion/${h.slug}`}
                    className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg transition-colors hover:bg-surface-hover"
                  >
                    <IconoDePagina icono={h.icono} />
                    <span className="font-medium underline decoration-line underline-offset-2">
                      {h.titulo}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* El enlace visto al revés: quién nombra a esta página. Es lo que hace que la base se
            pueda recorrer en los dos sentidos, como en Notion. */}
        {enlazanAca.length > 0 && (
          <section className={`mt-12 border-t border-line pt-4 ${INSET_CONTENIDO}`}>
            <h2 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-fg-muted">
              Enlazan acá
            </h2>
            <ul className="flex flex-wrap gap-2">
              {enlazanAca.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/documentacion/${p.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
                  >
                    <IconoDePagina icono={p.icono} />
                    {p.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
    </>
  );
}
