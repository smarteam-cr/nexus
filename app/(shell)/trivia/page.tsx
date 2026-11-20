/**
 * /trivia — las trivias de quien mira y las partidas que condujo. Desde acá se crea una trivia nueva (con
 * `trivias.write`); cada trivia abre su editor, donde también se lanza, y cada partida abre su pantalla (en vivo) o su
 * resultado (terminada). Sin el SQL del módulo, avisa qué falta y no consulta nada.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, PageHeader, buttonVariants } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { SQL_DE_TRIVIAS, triviasDisponible } from "@/lib/trivias/disponible";
import { listarPartidas, listarTrivias } from "@/lib/trivias/queries";
import ListaDeTrivias from "@/components/trivias/ListaDeTrivias";
import TablaDePartidas from "@/components/trivias/TablaDePartidas";

export const dynamic = "force-dynamic";

const DESCRIPCION = "Trivias en vivo para el coaching del equipo: las proyectas en la reunión y cada quien responde desde su teléfono.";

export default async function TriviasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "trivias", "read"))) redirect("/para-ti");

  if (!(await triviasDisponible())) {
    return (
      <div className={SHELL_DEFAULT}>
        <PageHeader title="Trivias" description={DESCRIPCION} />
        <Alert variant="warning" title="Las trivias todavía no están disponibles">
          Falta aplicar <code className="font-mono text-xs">{SQL_DE_TRIVIAS}</code> en la base.
        </Alert>
      </div>
    );
  }

  const [puedeEditar, trivias, partidas] = await Promise.all([
    can(ctx.teamMember, "trivias", "write"),
    listarTrivias(ctx.teamMember.id),
    listarPartidas(ctx.teamMember.id),
  ]);

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Trivias"
        description={DESCRIPCION}
        action={
          puedeEditar ? (
            <Link href="/trivia/new" className={buttonVariants({ variant: "primary", size: "md" })}>
              Nueva trivia
            </Link>
          ) : undefined
        }
      />
      <div className="space-y-6">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-fg">Tus trivias</h2>
          <ListaDeTrivias trivias={trivias} puedeEditar={puedeEditar} />
        </section>
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-fg">Partidas</h2>
          <TablaDePartidas partidas={partidas} vacio="Cuando lances una trivia, sus partidas aparecen acá." />
        </section>
      </div>
    </div>
  );
}
