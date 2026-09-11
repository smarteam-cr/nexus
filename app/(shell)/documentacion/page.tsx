/**
 * app/(shell)/documentacion/page.tsx — el Inicio de la base de conocimiento.
 *
 * Reemplaza al manual, que hasta el 2026-09-11 ERA esta pantalla y vivía escrito en el código.
 * Ahora el manual es una página más de la base («¿Cómo funciona Nexus?») y acá se entra: las
 * páginas de primer nivel y lo último que alguien editó.
 *
 * El guard va acá aunque el layout también mire: el ítem del menú es cosmético y no autoriza nada.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeader, EmptyState } from "@/components/ui";
import { arbolDePaginas, editadasHacePoco } from "@/lib/documentacion/consultas";
import RedirigirAnclaVieja from "@/components/documentacion/RedirigirAnclaVieja";

export default async function InicioDeDocumentacion() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");

  const [arbol, recientes, puedeEscribir] = await Promise.all([
    arbolDePaginas(),
    editadasHacePoco(),
    can(ctx.teamMember, "documentacion", "write"),
  ]);

  return (
    <div className={SHELL_DEFAULT}>
      {/* Los enlaces viejos del manual traen su ancla en la dirección; esto los reenvía. */}
      <RedirigirAnclaVieja />

      <PageHeader
        title="Documentación"
        description="La base de conocimiento del equipo: cómo funciona Nexus, cómo trabajamos y todo lo que vayamos escribiendo."
      />

      {arbol.length === 0 ? (
        <EmptyState
          title="Todavía no hay páginas"
          description={
            puedeEscribir
              ? "Creá la primera desde el «+» del panel de la izquierda."
              : "Cuando alguien del equipo escriba la primera, va a aparecer acá."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {arbol.map((p) => (
            <Link
              key={p.id}
              href={`/documentacion/${p.slug}`}
              className="rounded-lg border border-line bg-surface p-4 transition-colors hover:bg-surface-hover"
            >
              <div className="flex items-center gap-2">
                <span aria-hidden="true">{p.icono ?? "📄"}</span>
                <span className="truncate font-medium text-fg">{p.titulo}</span>
                {p.bloqueada && (
                  <span className="text-2xs text-fg-muted" title="Bloqueada: la edita el liderazgo">
                    🔒
                  </span>
                )}
              </div>
              {p.hijas.length > 0 && (
                <p className="mt-2 truncate text-xs text-fg-muted">
                  {p.hijas.length} {p.hijas.length === 1 ? "subpágina" : "subpáginas"}:{" "}
                  {p.hijas.map((h) => h.titulo).join(" · ")}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {recientes.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-fg-muted">
            Editadas hace poco
          </h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {recientes.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/documentacion/${p.slug}`}
                  className="flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-surface-hover"
                >
                  <span aria-hidden="true">{p.icono ?? "📄"}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{p.titulo}</span>
                  <span className="shrink-0 text-2xs text-fg-muted">{p.editadaPorEmail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
