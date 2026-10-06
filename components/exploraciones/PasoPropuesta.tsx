"use client";

/**
 * PasoPropuesta — armar la propuesta comercial con lo explorado.
 *
 * Pieza propia desde el 2026-10-01 (pedido de Elías): «lo de armar propuesta tiene más relevancia
 * incluso para estar en una pestaña». Antes vivía al pie de Casos de uso. Arriba, ¿está lista para
 * proponer? (los siete puntos: avisan, no bloquean); después, el negocio de HubSpot, el nombre y el
 * botón que la arma y la genera; abajo, las propuestas que ya nacieron de esta exploración.
 *
 * Desde el 2026-10-05 (unión con Propuestas) arriba van las propuestas de la EMPRESA: las que usan
 * esta preventa y las que se armaron sin ella, con «Usar esta preventa». Una propuesta puede usar la
 * preventa aunque haya nacido en Propuestas; la escritura es la misma que la del contexto de la
 * propuesta (PUT /api/business-cases/[id]/preventa).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Input, Select, Skeleton, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { listaParaProponer } from "@/lib/exploraciones/calidad";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { useLienzo } from "./contexto";

interface Negocio {
  id: string;
  name: string;
  isWon: boolean;
  isClosed: boolean;
  pipeline: string | null;
  stage: string | null;
}

const ESTADO_DE_LA_PROPUESTA: Record<string, string> = { DRAFT: "Borrador", PUBLISHED: "Publicada", ARCHIVED: "Archivada" };

export function ListaParaProponer() {
  const { exp, chequeo } = useLienzo();
  const puntos = listaParaProponer(exp.estado, chequeo);
  const cumplidos = puntos.filter((p) => p.cumplido).length;
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg">Lista para proponer el land</h3>
        <span className="text-xs tabular-nums text-fg-muted">
          {cumplidos} de {puntos.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {puntos.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border text-2xs",
                p.cumplido ? "border-success-line bg-success-surface text-success-ink" : "border-line text-fg-muted",
              )}
              aria-hidden="true"
            >
              {p.cumplido ? "✓" : ""}
            </span>
            <span className={p.cumplido ? "text-fg" : "text-fg-secondary"}>{p.titulo}</span>
            <span className="sr-only">{p.cumplido ? "cumplido" : "falta"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ArmarLaPropuesta({ negocios, alRecargar }: { negocios: Negocio[] | null; alRecargar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { exp, chequeo, puedeEditar, guardando, alDia } = useLienzo();
  const abiertos = (negocios ?? []).filter((n) => !n.isClosed);
  const [dealId, setDealId] = useState(abiertos[0]?.id ?? negocios?.[0]?.id ?? "");
  const [nombre, setNombre] = useState(`Propuesta — ${exp.empresa.nombre}`);
  const [armando, setArmando] = useState(false);
  const faltan = listaParaProponer(exp.estado, chequeo).filter((p) => !p.cumplido).length;

  async function armar() {
    setArmando(true);
    try {
      // Lo que se acaba de elegir (un caso de uso, por ejemplo) tiene que estar guardado antes.
      await alDia();
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/propuesta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, nombre }),
      });
      const data = (await res.json().catch(() => ({}))) as { businessCaseId?: string; error?: string };
      if (!res.ok || !data.businessCaseId) {
        toast.error(data.error ?? "No se pudo armar la propuesta.");
        return;
      }
      // La genera con IA de una vez: la pantalla de la propuesta retoma la generación en curso.
      await fetch(`/api/business-cases/${data.businessCaseId}/generate`, { method: "POST" }).catch(() => null);
      router.push(`/business-cases/${data.businessCaseId}`);
    } catch {
      toast.error("No se pudo armar la propuesta. Revisa tu conexión.");
    } finally {
      setArmando(false);
    }
  }

  const etiquetaDelNegocio = (n: Negocio) =>
    `${n.name}${n.stage ? ` · ${n.stage}` : ""}${n.isWon ? " · ganado" : n.isClosed ? " · cerrado" : ""}`;

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <h3 className="text-sm font-semibold text-fg">Armar una propuesta nueva</h3>
        <p className="text-xs text-fg-muted">
          Crea la Propuesta de Nexus con lo que puede ver el cliente de esta preventa y la genera con IA: sus metas en cifras como criterio de éxito, el nivel de cada área tal como quedó confirmado y los casos de uso elegidos. Lo interno (hipótesis, presupuesto, quién decide, objeciones, lo que nadie exploró) no entra. El precio se pone a mano, como siempre.
        </p>
      </div>
      {negocios === null ? (
        <Alert variant="warning" title="No se pudo consultar HubSpot">
          Sin el negocio no se puede armar la propuesta.{" "}
          <button type="button" className="underline" onClick={alRecargar}>
            Volver a intentar
          </button>
        </Alert>
      ) : negocios.length === 0 ? (
        <Alert variant="warning" title="La empresa no tiene negocios en HubSpot">
          La propuesta se une al proyecto por el negocio: créalo en HubSpot y vuelve.{" "}
          <button type="button" className="underline" onClick={alRecargar}>
            Volver a buscar
          </button>
        </Alert>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-fg-secondary">Negocio en HubSpot</span>
            <Select value={dealId} disabled={!puedeEditar || armando} onChange={(ev) => setDealId(ev.target.value)}>
              {negocios.map((n) => (
                <option key={n.id} value={n.id}>
                  {etiquetaDelNegocio(n)}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-fg-secondary">Nombre de la propuesta</span>
            <Input value={nombre} disabled={!puedeEditar || armando} onChange={(ev) => setNombre(ev.target.value)} maxLength={200} />
          </label>
        </div>
      )}
      {faltan > 0 && negocios && negocios.length > 0 && (
        <p className="text-xs text-fg-muted">
          Faltan {faltan} de los siete puntos de «lista para proponer». Puedes armarla igual: lo que falta queda a la vista arriba.
        </p>
      )}
      {puedeEditar && negocios && negocios.length > 0 && (
        <Button variant="primary" loading={armando} disabled={!dealId || !nombre.trim() || guardando} onClick={() => void armar()}>
          Armar y generar la propuesta
        </Button>
      )}
    </section>
  );
}

interface PropuestaDeLaEmpresa {
  id: string;
  nombre: string;
  estado: string;
  creadaEn: string;
  arma: string | null;
  uso: "esta" | "otra" | "ninguna";
}

function PropuestasDeLaEmpresa({ propuestas, alCambiar }: { propuestas: PropuestaDeLaEmpresa[]; alCambiar: () => void }) {
  const toast = useToast();
  const { exp, puedeEditar } = useLienzo();
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  if (propuestas.length === 0) return null;
  const usan = propuestas.filter((p) => p.uso === "esta");
  const otras = propuestas.filter((p) => p.uso !== "esta");

  async function usar(id: string, exploracionId: string | null) {
    setEnVuelo(id);
    try {
      const res = await fetch(`/api/business-cases/${id}/preventa`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exploracionId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo cambiar.");
        return;
      }
      toast.success(exploracionId ? "La propuesta ya usa esta preventa. La próxima versión la lee." : "La propuesta dejó de usar esta preventa.");
      alCambiar();
    } catch {
      toast.error("No se pudo cambiar. Revisa tu conexión.");
    } finally {
      setEnVuelo(null);
    }
  }

  const fila = (p: PropuestaDeLaEmpresa, accion: ReactNode) => (
    <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5">
      <span className="flex min-w-60 flex-1 flex-col gap-0.5">
        <Link href={`/business-cases/${p.id}`} className="text-sm font-semibold text-fg hover:text-brand">
          {p.nombre}
        </Link>
        <span className="text-xs text-fg-muted">
          {ESTADO_DE_LA_PROPUESTA[p.estado] ?? p.estado} · {p.arma ? `la arma ${p.arma} · ` : ""}
          {diaCorto(p.creadaEn)}
          {p.uso === "otra" ? " · usa otra preventa" : ""}
        </span>
      </span>
      {puedeEditar && accion}
    </li>
  );

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg">Propuestas de {exp.empresa.nombre}</h3>
        <Link href="/business-cases" className="text-xs text-brand hover:underline">
          Ver en Propuestas ›
        </Link>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Usan esta preventa</p>
      {usan.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface-muted px-3 py-2 text-xs text-fg-muted">Ninguna todavía.</p>
      ) : (
        <ul className="space-y-2">
          {usan.map((p) =>
            fila(
              p,
              <button
                type="button"
                disabled={enVuelo !== null}
                onClick={() => void usar(p.id, null)}
                className="text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
              >
                Dejar de usarla
              </button>,
            ),
          )}
        </ul>
      )}
      {otras.length > 0 && (
        <>
          <p className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Sin esta preventa</p>
          <ul className="space-y-2">
            {otras.map((p) =>
              fila(
                p,
                <button
                  type="button"
                  disabled={enVuelo !== null}
                  onClick={() => void usar(p.id, exp.id)}
                  title={p.uso === "otra" ? "Deja de usar la otra preventa y usa esta" : undefined}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                >
                  {enVuelo === p.id ? "Usando…" : "Usar esta preventa"}
                </button>,
              ),
            )}
          </ul>
          <p className="text-xs text-fg-muted">La próxima versión que se genere ya la lee. Lo que el cliente tiene hoy no cambia solo.</p>
        </>
      )}
    </section>
  );
}

export default function PasoPropuesta() {
  const { exp } = useLienzo();
  const [negocios, setNegocios] = useState<Negocio[] | null | undefined>(undefined);
  const [propuestas, setPropuestas] = useState<PropuestaDeLaEmpresa[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Cada «volver a intentar» vuelve a pedir los negocios (se leen de HubSpot).
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/sales/exploraciones/${exp.id}/propuesta`);
        const data = (await res.json().catch(() => ({}))) as {
          negocios?: Negocio[] | null;
          propuestas?: PropuestaDeLaEmpresa[];
          error?: string;
        };
        if (!vivo) return;
        if (!res.ok) {
          setError(data.error ?? "No se pudo cargar la propuesta.");
          return;
        }
        setError(null);
        setNegocios(data.negocios ?? null);
        setPropuestas(data.propuestas ?? []);
      } catch {
        if (vivo) setError("No se pudo cargar la propuesta. Revisa tu conexión.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [exp.id, intento]);

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger">{error}</Alert>}
      <PropuestasDeLaEmpresa propuestas={propuestas} alCambiar={() => setIntento((n) => n + 1)} />
      <ListaParaProponer />
      {negocios === undefined && !error ? (
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : negocios !== undefined ? (
        <ArmarLaPropuesta key={negocios?.map((n) => n.id).join(",") ?? "sin"} negocios={negocios} alRecargar={() => setIntento((n) => n + 1)} />
      ) : null}
    </div>
  );
}
