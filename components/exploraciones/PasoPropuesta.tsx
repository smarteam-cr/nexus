"use client";

/**
 * PasoPropuesta — de la exploración a la Propuesta de Nexus.
 *
 * Tres piezas: ¿está lista para proponer? (los siete puntos: avisan, no bloquean), los casos de uso
 * del catálogo que llevan cada área a Funcional (el agente los sugiere, el vendedor elige) y el
 * botón que arma la propuesta y la genera. El precio se pone a mano en la propuesta, como siempre.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Select, Skeleton, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { listaParaProponer } from "@/lib/exploraciones/calidad";
import type { CasoDeUsoElegido } from "@/lib/exploraciones/contenido";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { useLienzo } from "./contexto";
import { Propuestas } from "./Propuestas";
import { useCorrida } from "./useCorrida";

interface Negocio {
  id: string;
  name: string;
  isWon: boolean;
  isClosed: boolean;
  pipeline: string | null;
  stage: string | null;
}
interface Caso {
  id: string;
  titulo: string;
  descripcion: string;
  precio: string | null;
}
interface PropuestaArmada {
  id: string;
  nombre: string;
  estado: string;
  creadaEn: string;
}
interface DatosDelPaso {
  negocios: Negocio[] | null;
  catalogo: Caso[];
  propuestas: PropuestaArmada[];
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

function CasosDeUso({ catalogo }: { catalogo: Caso[] }) {
  const { exp, escala, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const e = exp.estado;
  const elegidos = Object.entries(e.contenido.casosDeUso);
  const areas = escala.areas.filter((a) => e.areas.includes(a.id));
  const sugeridos = pendientesPara((d) => d.tipo === "casoDeUso");
  const libres = catalogo.filter((c) => !(c.id in e.contenido.casosDeUso));

  const elegir = (caso: Caso, areaId: string | null) =>
    void cambiar([{ op: "casoDeUso", useCaseId: caso.id, valor: { titulo: caso.titulo, areaId } }]);
  const quitar = (id: string) => void cambiar([{ op: "casoDeUso", useCaseId: id, valor: null }]);
  const moverDeArea = (id: string, caso: CasoDeUsoElegido, areaId: string | null) =>
    void cambiar([{ op: "casoDeUso", useCaseId: id, valor: { ...caso, areaId } }]);

  const grupos = [
    ...areas.map((a) => ({ id: a.id as string | null, nombre: a.nombre })),
    { id: null, nombre: "Sin área" },
  ];
  const deGrupo = (id: string | null) => elegidos.filter(([, c]) => (id === null ? !c.areaId || !e.areas.includes(c.areaId) : c.areaId === id));

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">Casos de uso para la propuesta</h3>
          <p className="text-xs text-fg-muted">
            Los del catálogo de Smarteam que llevan cada área a Funcional, cubriendo lo que le falta y sus metas. El agente los sugiere; tú eliges. La propuesta los incluye con su precio del catálogo.
          </p>
        </div>
        {puedeEditar && (
          <Button size="sm" variant="secondary" loading={lanzando} disabled={corriendo || areas.length === 0 || catalogo.length === 0} onClick={() => void lanzar("casos")}>
            Sugerir con el agente
          </Button>
        )}
      </div>
      {corriendo && (
        <p className="text-xs text-fg-secondary" role="status">
          {corrida?.fase ?? "El agente está trabajando…"}
        </p>
      )}
      {areas.length === 0 && <p className="text-sm text-fg-muted">Elige primero las áreas en juego (paso «Preparación»).</p>}

      {grupos.map((g) => {
        const susElegidos = deGrupo(g.id);
        const susSugeridos = g.id ? sugeridos.filter((it) => (it.valor as CasoDeUsoElegido).areaId === g.id) : [];
        if (g.id === null && susElegidos.length === 0) return null;
        return (
          <div key={g.id ?? "sin-area"} className="space-y-2">
            <p className="text-xs font-medium text-fg-secondary">{g.nombre}</p>
            {susElegidos.length === 0 && susSugeridos.length === 0 && <p className="text-xs text-fg-muted">Todavía ninguno.</p>}
            <ul className="space-y-1.5">
              {susElegidos.map(([id, caso]) => (
                <li key={id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">{caso.titulo}</p>
                    {caso.razon && <p className="text-xs text-fg-secondary">{caso.razon}</p>}
                  </div>
                  {puedeEditar && (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Select
                        aria-label={`Área de «${caso.titulo}»`}
                        value={caso.areaId && e.areas.includes(caso.areaId) ? caso.areaId : ""}
                        disabled={guardando}
                        onChange={(ev) => moverDeArea(id, caso, ev.target.value || null)}
                      >
                        <option value="">Sin área</option>
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}
                          </option>
                        ))}
                      </Select>
                      <Button size="sm" variant="ghost" disabled={guardando} onClick={() => quitar(id)}>
                        Quitar
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Propuestas items={susSugeridos} />
          </div>
        );
      })}

      {libres.length > 0 && (
        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-fg-secondary">Todo el catálogo ({libres.length})</summary>
          <ul className="divide-y divide-line">
            {libres.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">
                    {c.titulo}
                    {c.precio && (
                      <Badge size="xs" className="ml-2">
                        {c.precio}
                      </Badge>
                    )}
                  </p>
                  <p className="line-clamp-2 text-xs text-fg-muted">{c.descripcion}</p>
                </div>
                {puedeEditar && (
                  <Select
                    aria-label={`Agregar «${c.titulo}»`}
                    value=""
                    disabled={guardando}
                    onChange={(ev) => {
                      if (ev.target.value) elegir(c, ev.target.value === "-" ? null : ev.target.value);
                    }}
                  >
                    <option value="">Agregar a…</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                    <option value="-">Sin área</option>
                  </Select>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {catalogo.length === 0 && <p className="text-xs text-fg-muted">El catálogo de casos de uso está vacío o no está disponible.</p>}
    </section>
  );
}

function ArmarLaPropuesta({ negocios, propuestas, alRecargar }: { negocios: Negocio[] | null; propuestas: PropuestaArmada[]; alRecargar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { exp, chequeo, puedeEditar } = useLienzo();
  const abiertos = (negocios ?? []).filter((n) => !n.isClosed);
  const [dealId, setDealId] = useState(abiertos[0]?.id ?? negocios?.[0]?.id ?? "");
  const [nombre, setNombre] = useState(`Propuesta — ${exp.empresa.nombre}`);
  const [armando, setArmando] = useState(false);
  const faltan = listaParaProponer(exp.estado, chequeo).filter((p) => !p.cumplido).length;

  async function armar() {
    setArmando(true);
    try {
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
          Crea la Propuesta de Nexus con lo que puede ver el cliente de este lienzo y la genera con IA: sus metas en cifras como criterio de éxito, el nivel de cada área tal como quedó aquí y los casos de uso elegidos. Lo interno (hipótesis, presupuesto, quién decide, lo que nadie exploró) no entra. El precio se pone a mano, como siempre.
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
            Ya lo creé
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
        <Button variant="primary" loading={armando} disabled={!dealId || !nombre.trim()} onClick={() => void armar()}>
          Armar y generar la propuesta
        </Button>
      )}
      {propuestas.length > 0 && (
        <div className="space-y-1.5 border-t border-line pt-3">
          <p className="text-xs font-medium text-fg-secondary">Propuestas que nacieron de esta exploración</p>
          <ul className="space-y-1">
            {propuestas.map((p) => (
              <li key={p.id} className="text-sm">
                <Link href={`/business-cases/${p.id}`} className="text-brand-light hover:underline">
                  {p.nombre}
                </Link>
                <span className="text-xs text-fg-muted">
                  {" "}
                  · {ESTADO_DE_LA_PROPUESTA[p.estado] ?? p.estado} · {diaCorto(p.creadaEn)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function PasoPropuesta() {
  const { exp } = useLienzo();
  const [datos, setDatos] = useState<DatosDelPaso | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cada «volver a intentar» vuelve a pedir el paso (los negocios se leen de HubSpot).
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/sales/exploraciones/${exp.id}/propuesta`);
        const data = (await res.json().catch(() => ({}))) as Partial<DatosDelPaso> & { error?: string };
        if (!vivo) return;
        if (!res.ok) {
          setError(data.error ?? "No se pudo cargar el paso.");
          return;
        }
        setError(null);
        setDatos({ negocios: data.negocios ?? null, catalogo: data.catalogo ?? [], propuestas: data.propuestas ?? [] });
      } catch {
        if (vivo) setError("No se pudo cargar el paso. Revisa tu conexión.");
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
      {!datos && !error ? (
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : datos ? (
        <>
          <CasosDeUso catalogo={datos.catalogo} />
          <ArmarLaPropuesta
            key={datos.negocios?.map((n) => n.id).join(",") ?? "sin"}
            negocios={datos.negocios}
            propuestas={datos.propuestas}
            alRecargar={() => setIntento((n) => n + 1)}
          />
        </>
      ) : null}
    </div>
  );
}
