/**
 * /trivia/games/[gameId] — una partida de trivia, para quien la condujo.
 *
 * Mientras se juega es la consola del anfitrión (la pantalla que se comparte en Meet: sala de espera, preguntas,
 * posiciones, podio). Terminada, es su resultado: el podio, las posiciones y lo que respondió cada uno.
 * A quien no la condujo le responde 404 (la partida es de quien la lanzó). Sin el SQL del módulo, avisa qué falta.
 */
import { notFound, redirect } from "next/navigation";
import { Alert, PageHeader, type Crumb } from "@/components/ui";
import ConsolaDelAnfitrion from "@/components/trivias/ConsolaDelAnfitrion";
import { formatearCodigo } from "@/lib/trivias/formato";
import { ResultadoDePartida } from "@/components/trivias/ResultadoDePartida";
import { can } from "@/lib/auth/permissions/engine";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SQL_DE_TRIVIAS, triviasDisponible } from "@/lib/trivias/disponible";
import { partidaDelAnfitrion, resultadoDePartida } from "@/lib/trivias/queries";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function PartidaDeTriviaPage({ params }: { params: Promise<{ gameId: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "trivias", "read"))) redirect("/para-ti");

  if (!(await triviasDisponible())) {
    return (
      <div className={SHELL_DEFAULT}>
        <PageHeader title="Partida" crumbs={[{ label: "Trivias", href: "/trivia" }, { label: "Partida" }]} />
        <Alert variant="warning" title="Las trivias todavía no están disponibles">
          Falta aplicar {SQL_DE_TRIVIAS} en la base de datos.
        </Alert>
      </div>
    );
  }

  const { gameId } = await params;
  const partida = await partidaDelAnfitrion(gameId, ctx.teamMember.id);
  if (!partida) notFound();

  // El título enlaza a la trivia (si todavía existe); el último crumb es la partida, que es esta página.
  const crumbs: Crumb[] = [
    { label: "Trivias", href: "/trivia" },
    { label: partida.titulo, href: partida.triviaId ? `/trivia/${partida.triviaId}` : undefined },
    { label: `Partida ${formatearCodigo(partida.codigo)}` },
  ];

  if (partida.estado === "FINALIZADA") {
    const resultado = await resultadoDePartida(partida.id, ctx.teamMember.id);
    if (!resultado) notFound();
    return (
      <div className={SHELL_DEFAULT}>
        <PageHeader title={partida.titulo} description="Resultado de la partida." crumbs={crumbs} />
        <ResultadoDePartida resultado={resultado} />
      </div>
    );
  }

  const puedeConducir = await can(ctx.teamMember, "trivias", "write");
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title={partida.titulo}
        description="Comparte esta pestaña en la reunión, o toca «Proyectar» para verla a pantalla completa."
        crumbs={crumbs}
      />
      <ConsolaDelAnfitrion
        partidaId={partida.id}
        codigo={partida.codigo}
        titulo={partida.titulo}
        puedeConducir={puedeConducir}
      />
    </div>
  );
}
