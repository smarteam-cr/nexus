/**
 * /trivia/new — crear una trivia. Pide `trivias.write`: sin él, vuelve al listado. Al guardar, la trivia abre su propia
 * página (/trivia/[id]), donde se sigue editando y se lanza.
 */
import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { SHELL_NARROW } from "@/lib/ui/page-shell";
import { SQL_DE_TRIVIAS, triviasDisponible } from "@/lib/trivias/disponible";
import EditorDeTrivia from "@/components/trivias/EditorDeTrivia";

export const dynamic = "force-dynamic";

export default async function NuevaTriviaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "trivias", "read"))) redirect("/para-ti");
  if (!(await can(ctx.teamMember, "trivias", "write"))) redirect("/trivia");

  const disponible = await triviasDisponible();

  return (
    <div className={SHELL_NARROW}>
      <PageHeader
        backHref="/trivia"
        backLabel="Trivias"
        title="Nueva trivia"
        description="Escribe las preguntas y guárdala. Después la lanzas en la reunión."
      />
      {disponible ? (
        <EditorDeTrivia />
      ) : (
        <Alert variant="warning" title="Las trivias todavía no están disponibles">
          Falta aplicar <code className="font-mono text-xs">{SQL_DE_TRIVIAS}</code> en la base.
        </Alert>
      )}
    </div>
  );
}
