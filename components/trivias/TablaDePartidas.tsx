"use client";

/**
 * components/trivias/TablaDePartidas.tsx — las partidas que condujo quien mira: cuándo, de qué trivia, con qué código y
 * modo, cuántos jugaron, quién ganó y si sigue en vivo. Un clic abre la partida (en vivo, la pantalla del anfitrión; ya
 * terminada, su resultado). La usan /trivia (todas) y /trivia/[id] (las de esa trivia, sin la columna de la trivia).
 *
 * Las fechas y los puntos salen de lib/trivias/formato.ts: iguales en el servidor y en el navegador (hidratación).
 */
import { useRouter } from "next/navigation";
import { Table, type TableColumn } from "@/components/ui";
import { ETIQUETA_DEL_MODO } from "@/lib/trivias/tipos";
import type { PartidaEnLista } from "@/lib/trivias/queries";
import { fechaYHoraCR, formatearPuntos } from "@/lib/trivias/formato";

function EstadoDeLaPartida({ estado, abandonada }: { estado: PartidaEnLista["estado"]; abandonada: boolean }) {
  if (abandonada) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-line bg-surface-muted px-2 py-0.5 text-xs font-medium text-fg-muted"
        title="Nadie la terminó y lleva más de medio día sin moverse. Ábrela para terminarla."
      >
        Sin terminar
      </span>
    );
  }
  if (estado === "FINALIZADA") {
    return (
      <span className="inline-flex items-center rounded-full border border-line bg-surface-muted px-2 py-0.5 text-xs font-medium text-fg-secondary">
        Terminada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success-line bg-success-surface px-2 py-0.5 text-xs font-medium text-success-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
      En vivo
    </span>
  );
}

export interface TablaDePartidasProps {
  partidas: PartidaEnLista[];
  /** Sin la columna de la trivia: en la página de una trivia sería la misma en todas las filas. */
  conTrivia?: boolean;
  /** Lo que se lee cuando todavía no hay partidas. */
  vacio: string;
}

export default function TablaDePartidas({ partidas, conTrivia = true, vacio }: TablaDePartidasProps) {
  const router = useRouter();

  const columnas: TableColumn<PartidaEnLista>[] = [
    {
      key: "fecha",
      header: "Fecha",
      width: "w-36",
      render: (p) => <span className="tabular-nums">{fechaYHoraCR(p.createdAt)}</span>,
    },
    ...(conTrivia
      ? [
          {
            key: "trivia",
            header: "Trivia",
            render: (p: PartidaEnLista) => <span className="block truncate font-medium text-fg">{p.titulo}</span>,
          },
        ]
      : []),
    {
      key: "codigo",
      header: "Código",
      width: "w-24",
      render: (p) => <span className="font-mono text-xs font-semibold tracking-wider text-fg">{p.codigo}</span>,
    },
    {
      key: "modo",
      header: "Modo",
      width: "w-28",
      hideOnMobile: true,
      render: (p) => ETIQUETA_DEL_MODO[p.modo],
    },
    {
      key: "jugadores",
      header: "Jugadores",
      width: "w-28",
      align: "right",
      render: (p) => <span className="tabular-nums">{p.jugadores}</span>,
    },
    {
      key: "ganador",
      header: "Ganador",
      width: conTrivia ? "w-48" : undefined,
      hideOnMobile: true,
      render: (p) =>
        p.ganador ? (
          <span className="block min-w-0">
            <span className="block truncate text-fg">{p.ganador.nombre}</span>
            <span className="block text-xs tabular-nums text-fg-muted">{formatearPuntos(p.ganador.puntos)} puntos</span>
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      key: "estado",
      header: "Estado",
      width: "w-28",
      render: (p) => <EstadoDeLaPartida estado={p.estado} abandonada={p.abandonada} />,
    },
  ];

  return (
    <Table
      columns={columnas}
      rows={partidas}
      rowKey={(p) => p.id}
      onRowClick={(p) => router.push(`/trivia/games/${p.id}`)}
      empty={<p className="text-sm text-fg-muted">{vacio}</p>}
    />
  );
}
