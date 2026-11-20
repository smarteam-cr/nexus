/**
 * /trivia/[id] — editar una trivia propia, lanzarla y ver sus partidas. Solo la ve quien la creó (si no, 404) y pide
 * `trivias.write`: sin él, vuelve al listado. Las partidas ya jugadas tienen su propia copia de las preguntas: editar la
 * trivia no cambia su historial.
 */
import { notFound, redirect } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { SHELL_NARROW } from "@/lib/ui/page-shell";
import { SQL_DE_TRIVIAS, triviasDisponible } from "@/lib/trivias/disponible";
import { leerTrivia, listarPartidas } from "@/lib/trivias/queries";
import EditorDeTrivia from "@/components/trivias/EditorDeTrivia";
import TablaDePartidas from "@/components/trivias/TablaDePartidas";

export const dynamic = "force-dynamic";

export default async function TriviaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "trivias", "read"))) redirect("/para-ti");
  if (!(await can(ctx.teamMember, "trivias", "write"))) redirect("/trivia");

  if (!(await triviasDisponible())) {
    return (
      <div className={SHELL_NARROW}>
        <PageHeader backHref="/trivia" backLabel="Trivias" title="Trivia" />
        <Alert variant="warning" title="Las trivias todavía no están disponibles">
          Falta aplicar <code className="font-mono text-xs">{SQL_DE_TRIVIAS}</code> en la base.
        </Alert>
      </div>
    );
  }

  const { id } = await params;
  const [trivia, partidas] = await Promise.all([
    leerTrivia(id, ctx.teamMember.id),
    listarPartidas(ctx.teamMember.id, { triviaId: id }),
  ]);
  if (!trivia) notFound();

  const n = trivia.preguntas.length;
  const veces = trivia.partidasJugadas;
  const jugada = veces === 0 ? "sin jugar todavía" : veces === 1 ? "jugada 1 vez" : `jugada ${veces} veces`;

  return (
    <div className={SHELL_NARROW}>
      <PageHeader
        backHref="/trivia"
        backLabel="Trivias"
        title={trivia.titulo}
        description={`${n} ${n === 1 ? "pregunta" : "preguntas"} · ${jugada}`}
      />
      <div className="space-y-6">
        <EditorDeTrivia inicial={trivia} />
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-fg">Partidas de esta trivia</h2>
          <TablaDePartidas
            partidas={partidas}
            conTrivia={false}
            vacio="Cuando lances esta trivia, sus partidas aparecen acá."
          />
        </section>
      </div>
    </div>
  );
}
