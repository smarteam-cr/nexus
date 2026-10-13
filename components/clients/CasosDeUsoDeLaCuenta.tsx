"use client";

/**
 * components/clients/CasosDeUsoDeLaCuenta.tsx — La cuenta › Casos de uso (2026-10-12, pedido de Elías: una sección
 * aparte, como la escala).
 *
 * Los casos de uso son de la EMPRESA: están en el ciclo de un proyecto recurrente, en el plan de crecimiento (lo que
 * viene después) o sugeridos, y se cierran cumplidos o no. Cada uno lleva su criterio de aceptación: cómo se va a saber
 * que funcionó. Datos: GET/POST /api/clients/[id]/casos-de-uso y PATCH …/[casoId]. Interno: el cliente no lo ve.
 */
import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { Alert, EmptyState, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { BotonAzul, BotonTexto, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { ETIQUETA_DE_ORIGEN, type OrigenDeCaso } from "@/lib/servicios/ciclo";
import type { CasoDeLaEmpresa, CasosDeLaEmpresa } from "@/lib/servicios/ciclos-server";

type Datos = CasosDeLaEmpresa & { puedeEditar: boolean };

const GRUPOS: Array<{ clave: string; titulo: string; ayuda: string; estados: string[] }> = [
  { clave: "ciclo", titulo: "En un ciclo", ayuda: "Lo que se está haciendo ahora.", estados: ["en_ciclo"] },
  { clave: "plan", titulo: "En el plan de crecimiento", ayuda: "Lo que viene después, en orden.", estados: ["en_plan"] },
  { clave: "sugeridos", titulo: "Sugeridos", ayuda: "Ideas para revisar con el cliente.", estados: ["sugerido"] },
  { clave: "cerrados", titulo: "Cerrados", ayuda: "Lo que ya se midió.", estados: ["cumplido", "no_cumplido"] },
];

const ETIQUETA_DE_ESTADO: Record<string, string> = {
  en_ciclo: "En un ciclo",
  en_plan: "En el plan",
  sugerido: "Sugerido",
  cumplido: "Cumplido",
  no_cumplido: "No se cumplió",
};

async function leerError(r: Response, porDefecto: string): Promise<string> {
  const j = (await r.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? porDefecto;
}

export default function CasosDeUsoDeLaCuenta({ clientId, slotDelPanel }: { clientId: string; slotDelPanel: HTMLElement | null }) {
  const toast = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/casos-de-uso`, { cache: "no-store" });
    if (!r.ok) {
      setError(await leerError(r, "No se pudieron cargar los casos de uso."));
      return;
    }
    setError(null);
    setDatos((await r.json()) as Datos);
  }, [clientId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enviar = async (url: string, method: "POST" | "PATCH", body: unknown, ok?: string) => {
    setOcupado(true);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) {
        toast.error(await leerError(r, "No se pudo guardar."));
        return false;
      }
      if (ok) toast.success(ok);
      await cargar();
      return true;
    } finally {
      setOcupado(false);
    }
  };
  const cambiar = (id: string, body: Record<string, unknown>, ok?: string) => enviar(`/api/clients/${clientId}/casos-de-uso/${id}`, "PATCH", body, ok);

  const encabezado = (
    <div>
      <h2 className="text-[22px] font-bold leading-tight text-fg">Casos de uso</h2>
      <p className="mt-1 text-[13px] text-fg-muted">
        Lo que se hace con la empresa, cada uno con su criterio de aceptación. Un caso de uso puede mover varias dimensiones de la escala.
      </p>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6">
        {encabezado}
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }
  if (!datos) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6" aria-busy="true">
        {encabezado}
        <SkeletonPanel minH="min-h-[220px]">
          <SkeletonText lines={4} />
        </SkeletonPanel>
      </div>
    );
  }

  const vivos = datos.casos.filter((c) => c.estado !== "descartado");
  const sinCriterio = vivos.filter((c) => (c.estado === "en_ciclo" || c.estado === "en_plan") && !c.criterio?.trim());

  return (
    <div className="space-y-6 px-8 pb-10 pt-6">
      {encabezado}
      {slotDelPanel &&
        sinCriterio.length > 0 &&
        createPortal(
          <QueSigue>
            {sinCriterio.length === 1 ? "Un caso de uso no tiene" : `${sinCriterio.length} casos de uso no tienen`} criterio de aceptación: no se va a poder medir si funcionó.
          </QueSigue>,
          slotDelPanel,
        )}

      {vivos.length === 0 ? (
        <EmptyState
          title="Esta empresa todavía no tiene casos de uso"
          description="Súmalos acá: al ciclo de un proyecto recurrente o al plan de crecimiento, con su criterio de aceptación."
        />
      ) : (
        GRUPOS.map((g) => {
          const casos = vivos.filter((c) => g.estados.includes(c.estado));
          if (!casos.length) return null;
          return (
            <section key={g.clave} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-semibold text-fg">{g.titulo}</h3>
                <span className="text-xs text-fg-muted">
                  {casos.length} · {g.ayuda}
                </span>
              </div>
              <ul className="space-y-2">
                {casos.map((c) => (
                  <Caso key={c.id} caso={c} puedeEditar={datos.puedeEditar} ocupado={ocupado} onCambiar={(body, ok) => cambiar(c.id, body, ok)} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {datos.puedeEditar && (
        <NuevoCaso
          ciclos={datos.ciclosAbiertos}
          ocupado={ocupado}
          onCrear={(body) => enviar(`/api/clients/${clientId}/casos-de-uso`, "POST", body, "Se sumó el caso de uso.")}
        />
      )}
    </div>
  );
}

function Caso({
  caso,
  puedeEditar,
  ocupado,
  onCambiar,
}: {
  caso: CasoDeLaEmpresa;
  puedeEditar: boolean;
  ocupado: boolean;
  onCambiar: (body: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(caso.titulo);
  const [resultado, setResultado] = useState(caso.resultado ?? "");
  const [criterio, setCriterio] = useState(caso.criterio ?? "");
  const [metrica, setMetrica] = useState(caso.metrica ?? "");
  const cerrado = caso.estado === "cumplido" || caso.estado === "no_cumplido";
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      {!editando ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="text-[14.5px] font-semibold text-fg">{caso.titulo}</p>
              <span
                className={cn(
                  "rounded-full border px-2 py-px text-[11px]",
                  caso.estado === "cumplido"
                    ? "border-success-line bg-success-surface text-success-ink"
                    : caso.estado === "no_cumplido"
                      ? "border-warn-line bg-warn-surface text-warn-ink"
                      : "border-line bg-surface text-fg-secondary",
                )}
              >
                {ETIQUETA_DE_ESTADO[caso.estado] ?? caso.estado}
              </span>
            </div>
            {caso.resultado && <p className="text-[13px] text-fg-secondary">{caso.resultado}</p>}
            {caso.criterio?.trim() ? (
              <p className="text-xs text-fg-secondary">
                <span className="font-medium">Criterio:</span> {caso.criterio}
                {caso.metrica ? <span className="text-fg-muted"> · {caso.metrica}</span> : null}
              </p>
            ) : (
              <p className="text-xs text-warn-ink">Sin criterio de aceptación.</p>
            )}
            {caso.mueve.length > 0 && (
              <p className="text-xs text-fg-muted">
                Mueve: {caso.mueve.map((m) => `${m.area ? `${m.area} · ` : ""}${m.dimension}${m.nivel ? ` → ${m.nivel}` : ""}`).join(", ")}
              </p>
            )}
            <p className="text-xs text-fg-muted">
              {caso.proyecto ? `${caso.proyecto.nombre}${caso.ciclo ? ` · ciclo ${caso.ciclo.numero}` : ""} · ` : ""}
              {ETIQUETA_DE_ORIGEN[caso.origen as OrigenDeCaso] ?? caso.origen}
            </p>
          </div>
          {puedeEditar && (
            <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
              {caso.estado === "en_ciclo" && (
                <>
                  <BotonTexto disabled={ocupado} onClick={() => void onCambiar({ estado: "cumplido" }, "Quedó cumplido.")}>
                    Cumplido
                  </BotonTexto>
                  <BotonTexto disabled={ocupado} onClick={() => void onCambiar({ estado: "no_cumplido" }, "Quedó como no cumplido.")}>
                    No se cumplió
                  </BotonTexto>
                </>
              )}
              {caso.estado === "sugerido" && (
                <BotonTexto disabled={ocupado} onClick={() => void onCambiar({ estado: "en_plan" }, "Pasó al plan de crecimiento.")}>
                  Al plan
                </BotonTexto>
              )}
              {cerrado && (
                <BotonTexto disabled={ocupado} onClick={() => void onCambiar({ estado: "en_plan" }, "Volvió al plan de crecimiento.")}>
                  Reabrir
                </BotonTexto>
              )}
              <BotonTexto onClick={() => setEditando(true)}>Editar</BotonTexto>
              <BotonTexto disabled={ocupado} onClick={() => void onCambiar({ quitar: true }, "Se quitó el caso de uso.")}>
                Quitar
              </BotonTexto>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Título">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} />
          </Field>
          <Field label="El resultado que persigue">
            <Textarea value={resultado} onChange={(e) => setResultado(e.target.value)} rows={2} maxLength={4000} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Criterio de aceptación">
              <Input value={criterio} onChange={(e) => setCriterio(e.target.value)} maxLength={4000} />
            </Field>
            <Field label="Métrica">
              <Input value={metrica} onChange={(e) => setMetrica(e.target.value)} maxLength={200} />
            </Field>
          </div>
          <div className="flex gap-2">
            <BotonAzul
              disabled={ocupado || !titulo.trim()}
              onClick={async () => {
                const ok = await onCambiar({
                  titulo: titulo.trim(),
                  resultado: resultado || null,
                  criterio: criterio || null,
                  metrica: metrica || null,
                });
                if (ok) setEditando(false);
              }}
            >
              Guardar
            </BotonAzul>
            <BotonTexto onClick={() => setEditando(false)}>Cancelar</BotonTexto>
          </div>
        </div>
      )}
    </li>
  );
}

function NuevoCaso({
  ciclos,
  ocupado,
  onCrear,
}: {
  ciclos: CasosDeLaEmpresa["ciclosAbiertos"];
  ocupado: boolean;
  onCrear: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [titulo, setTitulo] = useState("");
  const [criterio, setCriterio] = useState("");
  const [metrica, setMetrica] = useState("");
  const [donde, setDonde] = useState("");
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <p className={ROTULO_DEL_SISTEMA}>Sumar un caso de uso</p>
      <Field label="Título">
        <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} placeholder="Rutina de ventas en HubSpot" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label="Criterio de aceptación">
          <Input
            value={criterio}
            onChange={(e) => setCriterio(e.target.value)}
            maxLength={4000}
            placeholder="Todo negocio abierto tiene próxima actividad y conversación registrada"
          />
        </Field>
        <Field label="Métrica">
          <Input value={metrica} onChange={(e) => setMetrica(e.target.value)} maxLength={200} placeholder="% de negocios con próxima actividad" />
        </Field>
      </div>
      <Field label="Dónde va">
        <Select value={donde} onChange={(e) => setDonde(e.target.value)} className="sm:w-80">
          <option value="">Al plan de crecimiento</option>
          {ciclos.map((c) => (
            <option key={c.projectId} value={c.projectId}>
              Al ciclo {c.numero} de «{c.nombre}»
            </option>
          ))}
        </Select>
      </Field>
      <BotonAzul
        disabled={ocupado || !titulo.trim()}
        onClick={async () => {
          const ok = await onCrear({
            titulo: titulo.trim(),
            criterio: criterio || null,
            metrica: metrica || null,
            projectId: donde || null,
          });
          if (ok) {
            setTitulo("");
            setCriterio("");
            setMetrica("");
          }
        }}
      >
        Sumar
      </BotonAzul>
    </section>
  );
}
