"use client";

/**
 * BuscarEnReuniones — buscar en lo que se dijo en las reuniones con una empresa (etapa 4c de docs/mi-dia-plan.md).
 * Palabras sueltas, o «una frase entre comillas». Sin tildes da lo mismo. Cada resultado es la frase tal cual, con
 * quién la dijo y en qué reunión.
 *
 * Datos: GET /api/clients/[id]/buscar-en-reuniones?q=…
 */
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { partesResaltadas } from "@/lib/busqueda/turnos";
import type { ResultadoDeBusqueda } from "@/lib/busqueda/buscar-server";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export function FraseDeReunion({ r, q }: { r: ResultadoDeBusqueda; q: string }) {
  return (
    <li className="space-y-0.5 text-[13px]">
      <p className="text-fg-secondary">
        «
        {partesResaltadas(r.texto, q).map((p, i) =>
          p.marca ? (
            <mark key={i} className="rounded-sm bg-warn-surface px-0.5 text-fg">
              {p.texto}
            </mark>
          ) : (
            <span key={i}>{p.texto}</span>
          ),
        )}
        »
      </p>
      <p className="text-xs text-fg-muted">
        {r.hablante} ·{" "}
        <Link href={`/sessions/${r.sessionId}`} className="transition-colors hover:text-brand">
          {r.titulo} · {fecha(r.fecha)}
        </Link>
      </p>
    </li>
  );
}

export default function BuscarEnReuniones({ clientId, nombre }: { clientId: string; nombre: string }) {
  const [q, setQ] = useState("");
  const [buscado, setBuscado] = useState("");
  const [resultados, setResultados] = useState<ResultadoDeBusqueda[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const texto = q.trim();
    if (texto.length < 3) return;
    setBuscando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/buscar-en-reuniones?q=${encodeURIComponent(texto)}`, { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { disponible?: boolean; resultados?: ResultadoDeBusqueda[]; error?: string } | null;
      if (!r.ok) {
        setAviso(j?.error ?? "No se pudo buscar.");
        return;
      }
      if (j?.disponible === false) setAviso("La búsqueda todavía no está lista en este servidor.");
      setBuscado(texto);
      setResultados(j?.resultados ?? []);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
      <h2 className={ROTULO_DEL_SISTEMA}>Buscar en las reuniones con {nombre}</h2>
      <form onSubmit={buscar} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="integración, precio, «base de datos»…" aria-label="Qué buscar en las reuniones" />
        <button
          type="submit"
          disabled={buscando || q.trim().length < 3}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-60"
        >
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </form>
      {aviso && <p className="text-xs text-fg-muted">{aviso}</p>}
      {resultados && (
        resultados.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No se dijo «{buscado}» en las reuniones con transcripción de los últimos meses.</p>
        ) : (
          <ul className="space-y-3">
            {resultados.map((r, i) => (
              <FraseDeReunion key={`${r.sessionId}-${i}`} r={r} q={buscado} />
            ))}
          </ul>
        )
      )}
    </section>
  );
}
