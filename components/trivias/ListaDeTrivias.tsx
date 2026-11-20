"use client";

/**
 * components/trivias/ListaDeTrivias.tsx — «Tus trivias» en /trivia: título, cuántas preguntas tiene, cuántas veces se
 * jugó y cuándo se editó por última vez. Un clic abre el editor, donde también se lanza.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState, Table, buttonVariants, type TableColumn } from "@/components/ui";
import type { TriviaEnLista } from "@/lib/trivias/queries";
import { fechaCortaCR } from "@/lib/trivias/formato";

function vecesJugada(n: number): string {
  if (n === 0) return "Sin jugar";
  return n === 1 ? "1 vez" : `${n} veces`;
}

export interface ListaDeTriviasProps {
  trivias: TriviaEnLista[];
  /** Puede crear y editar (`trivias.write`): sin eso, la lista no abre el editor. */
  puedeEditar: boolean;
}

export default function ListaDeTrivias({ trivias, puedeEditar }: ListaDeTriviasProps) {
  const router = useRouter();

  const columnas: TableColumn<TriviaEnLista>[] = [
    {
      key: "titulo",
      header: "Trivia",
      render: (t) => <span className="block truncate font-medium text-fg">{t.titulo}</span>,
    },
    {
      key: "preguntas",
      header: "Preguntas",
      width: "w-28",
      align: "right",
      render: (t) => <span className="tabular-nums">{t.preguntas}</span>,
    },
    {
      key: "partidas",
      header: "Jugada",
      width: "w-28",
      render: (t) => <span className={t.partidas === 0 ? "text-fg-muted" : undefined}>{vecesJugada(t.partidas)}</span>,
    },
    {
      key: "editada",
      header: "Última edición",
      width: "w-36",
      hideOnMobile: true,
      render: (t) => <span className="tabular-nums">{fechaCortaCR(t.updatedAt)}</span>,
    },
  ];

  return (
    <Table
      columns={columnas}
      rows={trivias}
      rowKey={(t) => t.id}
      onRowClick={puedeEditar ? (t) => router.push(`/trivia/${t.id}`) : undefined}
      empty={
        <EmptyState
          variant="dashed"
          title="Todavía no tienes trivias"
          description={
            puedeEditar
              ? "Arma las preguntas una vez y lánzalas en la reunión: el equipo responde desde el teléfono."
              : "Para crear trivias necesitas el permiso de editarlas. Pídeselo a quien administra Nexus."
          }
          action={
            puedeEditar ? (
              <Link href="/trivia/new" className={buttonVariants({ variant: "primary", size: "md" })}>
                Crear una trivia
              </Link>
            ) : undefined
          }
        />
      }
    />
  );
}
