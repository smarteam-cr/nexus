"use client";

/**
 * components/cs/PropuestasDelVigia.tsx — EL ÚNICO LUGAR DONDE SE DECIDE UNA PROPUESTA DE SALUD DEL VIGÍA (2026-10-19).
 *
 * Una fila por propuesta: la cuenta, el proyecto, de qué salud a cuál, por qué (con las señales de hoy) y desde cuándo
 * espera, con «Confirmar» y «Descartar» a la vista. Se decide una por una sin saltar de cuenta en cuenta. Lo decidido
 * sale de la lista al instante; al volver a «Para ti», sale del número (la ruta olvida la medición de quien decidió).
 *
 * La propuesta pedida (`?proyecto=`) va resaltada y a la vista, con el único botón azul de la pantalla. Las reglas viven
 * en lib/cs/propuestas-del-vigia.ts.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { haceCuanto, plural } from "@/lib/cs/formato";
import { NOMBRE_DE_LA_SALUD, propuestaDestacada, type PropuestaDelVigia } from "@/lib/cs/propuestas-del-vigia";

export function PropuestasDelVigia({
  propuestas: iniciales,
  pedida,
  puedeCurar,
  hoy,
  contenedor,
}: {
  propuestas: PropuestaDelVigia[];
  /** `?proyecto=`: la que se abre resaltada. */
  pedida: string | null;
  /**
   * ⚠ Si puede decidir (`clientes.viewAll`, la celda que exige la ruta). Sin ella la lista se ve, sin los botones:
   * darían 403. Requerido y sin default, como en el resto de Éxito del cliente.
   */
  puedeCurar: boolean;
  hoy: string;
  contenedor: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [propuestas, setPropuestas] = useState(iniciales);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const destacada = propuestaDestacada(propuestas, pedida);
  const filaDestacada = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (pedida) filaDestacada.current?.scrollIntoView({ block: "center" });
    // Solo al abrir: después de decidir, la destacada pasa a la siguiente sin mover la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decidir = async (p: PropuestaDelVigia, action: "confirm" | "dismiss") => {
    setOcupada(p.projectId);
    try {
      await fetchJson(`/api/projects/${encodeURIComponent(p.projectId)}/health-proposal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setPropuestas((xs) => xs.filter((x) => x.projectId !== p.projectId));
      toast.success(
        action === "confirm"
          ? `${p.proyecto} quedó «${NOMBRE_DE_LA_SALUD[p.propuesta]}».`
          : `Descartada: ${p.proyecto} sigue «${NOMBRE_DE_LA_SALUD[p.actual]}».`,
      );
      router.refresh();
    } catch (e) {
      // 409 = ya la decidió otra persona (o el vigía la retiró): sale de la lista igual.
      if (e instanceof ApiError && e.status === 409) {
        setPropuestas((xs) => xs.filter((x) => x.projectId !== p.projectId));
        toast.info("Esa propuesta ya no estaba pendiente.");
      } else {
        toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la decisión.");
      }
    } finally {
      setOcupada(null);
    }
  };

  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title="Propuestas del vigía"
        crumbs={[{ label: "Éxito del cliente", href: "/customer-success" }, { label: "Propuestas del vigía" }]}
        description="El vigía mira el cronograma de cada proyecto. Cuando ve fases vencidas o semanas sin avance, propone pasar la salud del proyecto a «En riesgo». Nada cambia hasta que alguien lo confirma."
      />

      {propuestas.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="No hay propuestas por decidir"
          description="Cuando el vigía proponga cambiar la salud de un proyecto, aparece acá."
          action={
            <Link href="/para-ti" className="text-sm font-medium text-brand hover:underline">
              Volver a «Para ti»
            </Link>
          }
        />
      ) : (
        <section className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>{plural(propuestas.length, "propuesta por decidir", "propuestas por decidir")}</p>
          <ul className="space-y-2">
            {propuestas.map((p) => {
              const esLaDestacada = p.projectId === destacada;
              const espera = p.desde ? haceCuanto(p.desde, hoy) : null;
              return (
                <li
                  key={p.projectId}
                  ref={esLaDestacada ? filaDestacada : undefined}
                  data-proyecto={p.projectId}
                  className={cn(
                    "flex flex-wrap items-start gap-4 rounded-xl border bg-surface px-4 py-3.5",
                    esLaDestacada ? "border-info-line ring-2 ring-info-line" : "border-line",
                  )}
                >
                  <span className="mt-0.5 text-brand" aria-hidden>
                    <IconoDeSugerencia />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-xs text-fg-muted">
                      <Link href={`/customer-success/${encodeURIComponent(p.clientId)}?pestana=proyectos`} className="hover:text-brand hover:underline">
                        {p.cuenta}
                      </Link>
                      {p.cse ? ` · CSE: ${p.cse}` : " · sin CSE"}
                    </p>
                    <p className="text-sm text-fg">
                      <span className="font-semibold">{p.proyecto}</span>
                      {": salud de "}
                      <span className="font-medium">«{NOMBRE_DE_LA_SALUD[p.actual]}»</span>
                      {" a "}
                      <span className="font-semibold text-brand">«{NOMBRE_DE_LA_SALUD[p.propuesta]}»</span>
                    </p>
                    <p className="text-[13px] text-fg-secondary">Por qué: {p.razon}.</p>
                    <p className="text-xs text-fg-muted">
                      Lo propuso el vigía{espera ? ` ${espera}` : ""}. Confirmar fija la salud a mano; descartar la deja como la calcula Nexus.
                    </p>
                  </div>
                  {puedeCurar ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button size="sm" variant="destructive" disabled={ocupada !== null} onClick={() => decidir(p, "dismiss")}>
                        {ocupada === p.projectId ? "…" : "Descartar"}
                      </Button>
                      <Button size="sm" variant={esLaDestacada ? "primary" : "secondary"} disabled={ocupada !== null} onClick={() => decidir(p, "confirm")}>
                        {ocupada === p.projectId ? "…" : `Confirmar «${NOMBRE_DE_LA_SALUD[p.propuesta]}»`}
                      </Button>
                    </div>
                  ) : (
                    <span className="shrink-0 text-xs text-fg-muted">Lo confirma el liderazgo de Customer Success.</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
