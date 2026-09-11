/**
 * app/(shell)/documentacion/[slug]/page.tsx — una página de la base de conocimiento.
 *
 * El servidor decide TRES cosas y las baja como props, sin valor por defecto (regla de
 * `controles-sin-permiso`): si esta persona puede editar, si puede administrar, y el contenido
 * ya saneado. Sanear acá —y no en el navegador— es lo que evita que un bloque viejo o escrito a
 * mano deje la página sin abrir.
 *
 * Los datos de los bloques VIVOS se calculan acá y solo si la página tiene alguno: son registros
 * pesados y una consulta a la base, y la mayoría de las páginas no los usa.
 */
import { notFound, redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { paginaPorSlug, paginasVivas } from "@/lib/documentacion/consultas";
import { rutaDe } from "@/lib/documentacion/arbol";
import { sanearBloques } from "@/lib/documentacion/texto";
import { cargarDatosVivos, tieneBloquesVivos } from "@/lib/documentacion/vivos";
import EncabezadoDePagina from "@/components/documentacion/EncabezadoDePagina";
import PaginaCliente from "@/components/documentacion/PaginaCliente";
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
  if (!pagina || pagina.archivadaAt) notFound();

  const contenido = sanearBloques(pagina.contenido);

  const [puedeEscribir, puedeAdministrar, vivas, vivos] = await Promise.all([
    can(ctx.teamMember, "documentacion", "write"),
    can(ctx.teamMember, "documentacion", "manage"),
    paginasVivas(),
    tieneBloquesVivos(contenido) ? cargarDatosVivos() : Promise.resolve(null),
  ]);

  // Una página bloqueada se lee igual; editarla es del liderazgo.
  const editable = pagina.bloqueada ? puedeAdministrar : puedeEscribir;

  const migas = rutaDe(pagina.id, vivas)
    .slice(0, -1)
    .map((p) => ({ label: p.titulo, href: `/documentacion/${p.slug}` }));

  return (
    <div className={SHELL_DEFAULT}>
      <div className="max-w-3xl">
        <EncabezadoDePagina
          paginaId={pagina.id}
          titulo={pagina.titulo}
          icono={pagina.icono}
          migas={migas}
          bloqueada={pagina.bloqueada}
          editable={editable}
          puedeAdministrar={puedeAdministrar}
        />
        <PaginaCliente
          paginaId={pagina.id}
          version={pagina.version}
          /* El contenido viaja como JSON plano (así lo guarda la base y así lo sanea el
             servidor). La conversión al tipo del editor se hace ACÁ, en el único punto donde
             los dos mundos se tocan, en vez de repetirla dentro del cliente. */
          contenido={contenido as unknown as BloqueParcialDeDocumentacion[]}
          editable={editable}
          vivos={vivos}
        />
      </div>
    </div>
  );
}
