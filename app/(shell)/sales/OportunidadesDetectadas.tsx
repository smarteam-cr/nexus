import Link from "next/link";
import { ROTULO_DE_FUENTE, type OportunidadesDeCliente } from "@/lib/ventas/oportunidades";

/**
 * «Oportunidades detectadas» (D-11, 2026-09-04): por cliente, la sugerencia que el CSE dejó al
 * entregar y lo que el handoff registró como «se conversó y no se vendió». Solo lectura; lo monta
 * `SalesClient` únicamente cuando la página cargó los datos (gate `ventas.read` en page.tsx).
 * Sin estado: el colapso por cliente es un `<details>` nativo.
 */
export default function OportunidadesDetectadas({ grupos }: { grupos: OportunidadesDeCliente[] }) {
  const total = grupos.reduce((n, g) => n + g.items.length, 0);
  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-label="Oportunidades detectadas">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-base font-bold text-fg">Oportunidades detectadas</h2>
        <span className="text-xs text-fg-muted">
          {total} en {grupos.length} {grupos.length === 1 ? "cliente" : "clientes"} · lo que el cliente pidió y no se vendió, y lo que el CSE sugirió al entregar
        </span>
      </div>
      {grupos.length === 0 ? (
        <p className="text-xs text-fg-muted mt-2">
          Todavía nada: aparecen cuando un handoff registra «Se conversó y no se vendió» o un CSE deja una sugerencia al marcar la entrega.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {grupos.map((g) => (
            <details key={g.clientId} className="rounded-xl border border-line bg-surface-muted px-4 py-2">
              <summary className="cursor-pointer text-sm font-medium text-fg">
                {g.clientName}
                <span className="ml-2 text-xs font-normal text-fg-muted">
                  {g.items.length} {g.items.length === 1 ? "oportunidad" : "oportunidades"}
                  {g.ultima ? ` · ${fechaCorta(g.ultima)}` : ""}
                </span>
              </summary>
              <ul className="mt-2 space-y-2">
                {g.items.map((it, i) => (
                  <li key={`${it.projectId}-${it.fuente}-${i}`} className="text-xs">
                    <div className="flex items-center gap-2 flex-wrap text-fg-muted">
                      <span className="font-medium text-fg-secondary">{ROTULO_DE_FUENTE[it.fuente]}</span>
                      <span>·</span>
                      <Link href={`/clients/${it.clientId}?tab=${it.projectId}`} className="underline underline-offset-2 hover:text-fg">
                        {it.projectName}
                      </Link>
                      {it.fecha && <span>· {fechaCorta(it.fecha)}</span>}
                      {it.autor && <span>· {it.autor}</span>}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-fg">{it.texto}</p>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Determinista (UTC): el componente se renderiza en el servidor y se hidrata en el navegador. */
function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
