"use client";

/**
 * PasoPropuesta — armar la propuesta comercial con lo explorado.
 *
 * Pieza propia desde el 2026-10-01 (pedido de Elías): «lo de armar propuesta tiene más relevancia
 * incluso para estar en una pestaña». Antes vivía al pie de Casos de uso. Arriba, ¿está lista para
 * proponer? (los siete puntos: avisan, no bloquean); después, el negocio de HubSpot, el nombre y el
 * botón que la arma y la genera; abajo, las propuestas que ya nacieron de esta exploración.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
        <h3 className="text-sm font-semibold text-fg">Lista para proponer</h3>
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
        <h3 className="text-sm font-semibold text-fg">Armar la propuesta</h3>
        <p className="text-xs text-fg-muted">
          Crea la Propuesta de Nexus con lo que puede ver el cliente de esta exploración y la genera con IA: sus metas en cifras como criterio de éxito, el nivel de cada área tal como quedó confirmado y los casos de uso elegidos. Lo interno (hipótesis, presupuesto, quién decide, objeciones, lo que nadie exploró) no entra. El precio se pone a mano, como siempre.
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

function PropuestasArmadas() {
  const { propuestas } = useLienzo();
  if (propuestas.length === 0) return null;
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">Propuestas que nacieron de esta exploración</h3>
      <ul className="space-y-1">
        {propuestas.map((p) => (
          <li key={p.id} className="text-sm">
            <Link href={`/business-cases/${p.id}`} className="text-brand hover:underline">
              {p.nombre}
            </Link>
            <span className="text-xs text-fg-muted">
              {" "}
              · {ESTADO_DE_LA_PROPUESTA[p.estado] ?? p.estado} · {diaCorto(p.creadaEn)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PasoPropuesta() {
  const { exp } = useLienzo();
  const [negocios, setNegocios] = useState<Negocio[] | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Cada «volver a intentar» vuelve a pedir los negocios (se leen de HubSpot).
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/sales/exploraciones/${exp.id}/propuesta`);
        const data = (await res.json().catch(() => ({}))) as { negocios?: Negocio[] | null; error?: string };
        if (!vivo) return;
        if (!res.ok) {
          setError(data.error ?? "No se pudo cargar la propuesta.");
          return;
        }
        setError(null);
        setNegocios(data.negocios ?? null);
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
      <ListaParaProponer />
      {error && <Alert variant="danger">{error}</Alert>}
      {negocios === undefined && !error ? (
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : negocios !== undefined ? (
        <ArmarLaPropuesta key={negocios?.map((n) => n.id).join(",") ?? "sin"} negocios={negocios} alRecargar={() => setIntento((n) => n + 1)} />
      ) : null}
      <PropuestasArmadas />
    </div>
  );
}
