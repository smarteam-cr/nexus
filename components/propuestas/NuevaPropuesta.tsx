"use client";

/**
 * components/propuestas/NuevaPropuesta.tsx — crear una propuesta (rediseño del 2026-10-05).
 *
 * Tres pasos en una columna, cada uno se cierra en una línea al completarse:
 *   1. Empresa      — el dominio → la empresa en HubSpot y sus tratos (GET /api/business-cases/lookup).
 *   2. Qué se cotiza — el tipo (BC_TYPE_CATALOG): decide la plantilla y las etiquetas iniciales.
 *   3. Trato y nombre — el trato es opcional; el nombre sale del trato si se elige uno.
 *
 * CON O SIN PREVENTA: si la empresa ya está en Nexus y pasó por Preventa, se ofrece al elegirla
 * («Usarla como contexto», marcada). Sin preventa, la propuesta se arma igual. La unión se escribe
 * después de crear, por la misma puerta que el contexto de la propuesta
 * (PUT /api/business-cases/[id]/preventa): si fallara, la propuesta ya existe y se une desde ahí.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { BC_TYPE_CATALOG, DEFAULT_BC_TYPE_ID, resolveBcType } from "@/lib/business-cases/case-types";
import { fechaDeVentas } from "@/lib/business-cases/estado-de-la-propuesta";

type Deal = {
  id: string;
  name: string;
  amount: string | null;
  closedate: string | null;
  isWon: boolean;
  pipeline: string | null;
  stage: string | null;
};
type Lookup = {
  company: { id: string; name: string; domain: string | null } | null;
  deals: Deal[];
  existingClientId: string | null;
  existingClientName: string | null;
  existingIsProspect: boolean | null;
};
type Preventa = {
  id: string;
  responsable: string | null;
  actualizadaEn: string;
  areas: string[];
  lista: { cumplidos: number; total: number } | null;
};
type Paso = "empresa" | "tipo" | "trato";

function extractDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].trim();
}
function looksLikeDomain(d: string): boolean {
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d);
}

const ROTULO = "text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted";
const BOTON_AZUL =
  "inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50";
const BOTON_BLANCO =
  "inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-sm font-semibold text-fg-secondary transition-colors hover:bg-surface-hover disabled:opacity-50";
const BOTON_TEXTO = "text-[13px] text-brand transition-colors hover:text-brand-dark";

export default function NuevaPropuesta() {
  const router = useRouter();
  const toast = useToast();

  const [paso, setPaso] = useState<Paso>("empresa");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [preventas, setPreventas] = useState<Preventa[]>([]);
  /** La preventa que se usa, o "" para ninguna. Arranca en la más reciente. */
  const [preventaId, setPreventaId] = useState("");
  const [caseTypeId, setCaseTypeId] = useState(DEFAULT_BC_TYPE_ID);
  const [subtypeId, setSubtypeId] = useState<string>("");
  const [dealId, setDealId] = useState(""); // "" = todavía no hay trato
  const [name, setName] = useState("");
  const autoSearchedRef = useRef("");
  // Última sugerencia automática de nombre: si nadie la tocó, se recalcula por tipo y por trato.
  const suggestedNameRef = useRef("");

  const suggestName = useCallback((data: Lookup, typeId: string): string => {
    const won = data.deals.find((x) => x.isWon);
    if (won?.name) return won.name;
    const company = data.company?.name ?? "";
    return typeId === DEFAULT_BC_TYPE_ID ? company : `${resolveBcType(typeId).shortLabel} — ${company}`;
  }, []);

  const runSearch = useCallback(
    async (rawDomain: string) => {
      const d = extractDomain(rawDomain);
      if (d.length < 3) return;
      autoSearchedRef.current = d;
      setBusy(true);
      try {
        const data = await fetchJson<Lookup>(`/api/business-cases/lookup?domain=${encodeURIComponent(d)}`);
        if (!data.company) {
          toast.error("No hay ninguna empresa en HubSpot con ese dominio.");
          return;
        }
        setLookup(data);
        setDealId(""); // un trato elegido para la empresa ANTERIOR no aplica a esta
        const suggestion = suggestName(data, DEFAULT_BC_TYPE_ID);
        suggestedNameRef.current = suggestion;
        setName(suggestion);
        // Las preventas solo existen si la empresa ya está en Nexus.
        let delCliente: Preventa[] = [];
        if (data.existingClientId) {
          delCliente = await fetchJson<{ preventas: Preventa[] }>(
            `/api/business-cases/preventas?clientId=${encodeURIComponent(data.existingClientId)}`,
          )
            .then((r) => r.preventas)
            .catch(() => []);
        }
        setPreventas(delCliente);
        setPreventaId(delCliente[0]?.id ?? "");
        setPaso("tipo");
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo buscar la empresa.");
      } finally {
        setBusy(false);
      }
    },
    [toast, suggestName],
  );

  // Busca sola 1 s después de dejar de escribir un dominio completo.
  useEffect(() => {
    const d = extractDomain(domain);
    if (busy || paso !== "empresa" || autoSearchedRef.current === d || !looksLikeDomain(d)) return;
    const t = setTimeout(() => runSearch(domain), 1000);
    return () => clearTimeout(t);
  }, [domain, busy, paso, runSearch]);

  const selectedType = resolveBcType(caseTypeId);

  const seguirAlTrato = () => {
    if (!lookup) return;
    if (name === suggestedNameRef.current) {
      const suggestion = suggestName(lookup, caseTypeId);
      suggestedNameRef.current = suggestion;
      setName(suggestion);
    }
    setPaso("trato");
  };

  /** Elegir un trato re-sugiere el nombre con el del trato, SOLO si nadie lo escribió a mano. */
  const elegirTrato = (d: Deal | null) => {
    setDealId(d?.id ?? "");
    if (!lookup || name !== suggestedNameRef.current) return;
    const suggestion = d ? d.name : suggestName(lookup, caseTypeId);
    suggestedNameRef.current = suggestion;
    setName(suggestion);
  };

  const crear = async () => {
    if (!lookup?.company || busy) return;
    setBusy(true);
    try {
      const data = await fetchJson<{ businessCaseId: string }>("/api/business-cases/create-from-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: lookup.company.id,
          companyName: lookup.company.name,
          domain: lookup.company.domain,
          dealId: dealId || undefined,
          name: name.trim() || undefined,
          caseType: caseTypeId,
          caseSubtype: selectedType.subtypes?.length ? subtypeId || undefined : undefined,
        }),
      });
      if (preventaId) {
        await fetchJson(`/api/business-cases/${data.businessCaseId}/preventa`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exploracionId: preventaId }),
        }).catch(() => toast.info("La propuesta se creó, pero no se pudo usar la preventa: úsala desde su contexto."));
      }
      toast.success("Propuesta creada.");
      router.push(`/business-cases/${data.businessCaseId}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear la propuesta.");
      setBusy(false);
    }
  };

  const empresaLista = paso !== "empresa" && !!lookup?.company;
  const tipoListo = paso === "trato";

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-[13px] leading-[19px] text-fg-secondary">
        <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Con o sin preventa: si la empresa pasó por Preventa, te la ofrecemos al elegirla. Si no, la propuesta se arma igual.</span>
      </div>

      <ol className="flex flex-col gap-3">
        {/* 1 · Empresa */}
        <li className={cn("rounded-xl border bg-surface px-4 py-3.5", paso === "empresa" ? "border-info-line" : "border-line")}>
          <div className="flex items-center gap-3">
            <Numero n={1} hecho={empresaLista} activo={paso === "empresa"} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={ROTULO}>1 · Empresa</span>
              {empresaLista && lookup?.company && (
                <span className="truncate text-sm font-semibold text-fg">
                  {lookup.company.name}{" "}
                  <span className="font-normal text-fg-muted">
                    · {lookup.existingClientName ? (lookup.existingIsProspect ? "prospecto" : "cliente") : "nueva en Nexus"} ·{" "}
                    {lookup.deals.length === 1 ? "1 trato" : `${lookup.deals.length} tratos`} en HubSpot
                  </span>
                </span>
              )}
            </span>
            {empresaLista && (
              <button type="button" onClick={() => setPaso("empresa")} disabled={busy} className={BOTON_TEXTO}>
                Cambiar
              </button>
            )}
          </div>
          {paso === "empresa" && (
            <div className="mt-3.5 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-fg">Dominio de la empresa</span>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void runSearch(domain)}
                  placeholder="Ej: acmecorp.com"
                  autoFocus
                  className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
                />
                <span className="text-xs text-fg-muted">La buscamos en HubSpot apenas se vea completo.</span>
              </label>
              <div className="flex justify-end">
                <button type="button" onClick={() => void runSearch(domain)} disabled={busy || domain.trim().length < 3} className={BOTON_AZUL}>
                  {busy ? "Buscando…" : "Buscar la empresa"}
                </button>
              </div>
            </div>
          )}
        </li>

        {/* La preventa de la empresa, si pasó por ahí */}
        {empresaLista && preventas.length > 0 && (
          <li className="flex flex-col gap-2.5 rounded-xl border border-warn-line bg-warn-surface px-4 py-3">
            <span className="text-[13px] font-semibold text-fg">
              {lookup?.company?.name} pasó por Preventa
            </span>
            {preventas.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                <input
                  type={preventas.length > 1 ? "radio" : "checkbox"}
                  name="preventa"
                  className="mt-0.5"
                  checked={preventaId === p.id}
                  onChange={() => setPreventaId(preventaId === p.id && preventas.length === 1 ? "" : p.id)}
                />
                <span className="flex flex-col">
                  <span className="font-semibold text-fg">Usarla como contexto</span>
                  <span className="text-xs text-fg-muted">
                    {[
                      p.responsable && `La lleva ${p.responsable}`,
                      `actualizada el ${fechaDeVentas(p.actualizadaEn)}`,
                      p.areas.length > 0 && p.areas.join(" y "),
                      p.lista && `${p.lista.cumplidos} de ${p.lista.total} para proponer`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            ))}
            {preventas.length > 1 && (
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-fg-secondary">
                <input type="radio" name="preventa" checked={preventaId === ""} onChange={() => setPreventaId("")} />
                Sin preventa
              </label>
            )}
          </li>
        )}

        {/* 2 · Qué se cotiza */}
        <li className={cn("rounded-xl border bg-surface px-4 py-3.5", paso === "tipo" ? "border-info-line" : "border-line")}>
          <div className="flex items-center gap-3">
            <Numero n={2} hecho={tipoListo} activo={paso === "tipo"} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={ROTULO}>2 · Qué se cotiza</span>
              {tipoListo && (
                <span className="text-sm font-semibold text-fg">
                  {selectedType.label}
                  {selectedType.subtypes?.length && subtypeId
                    ? ` · ${selectedType.subtypes.find((s) => s.id === subtypeId)?.label ?? subtypeId}`
                    : ""}
                </span>
              )}
            </span>
            {tipoListo && (
              <button type="button" onClick={() => setPaso("tipo")} disabled={busy} className={BOTON_TEXTO}>
                Cambiar
              </button>
            )}
          </div>
          {paso === "tipo" && (
            <div className="mt-3.5 flex flex-col gap-3.5">
              <div role="radiogroup" aria-label="Qué se cotiza" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BC_TYPE_CATALOG.map((t) => {
                  const elegido = caseTypeId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={elegido}
                      disabled={!t.enabled}
                      onClick={() => {
                        setCaseTypeId(t.id);
                        setSubtypeId(t.subtypes?.[0]?.id ?? "");
                      }}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        elegido ? "border-brand bg-info-surface" : "border-line bg-surface hover:bg-surface-hover",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-[3px] h-3.5 w-3.5 flex-shrink-0 rounded-full bg-surface",
                          elegido ? "border-4 border-brand" : "border border-line",
                        )}
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-fg">
                          {t.label}
                          {!t.enabled && <span className="ml-1.5 text-[11px] font-normal text-fg-muted">· próximamente</span>}
                        </span>
                        <span className="text-xs leading-[17px] text-fg-muted">{t.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedType.subtypes?.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-fg">Tipo de sitio</span>
                  {selectedType.subtypes.map((s) => (
                    <label
                      key={s.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px]",
                        subtypeId === s.id ? "border-brand bg-info-surface" : "border-line hover:bg-surface-hover",
                      )}
                    >
                      <input type="radio" name="subtipo" checked={subtypeId === s.id} onChange={() => setSubtypeId(s.id)} />
                      {s.label}
                    </label>
                  ))}
                </div>
              ) : null}
              <div className="flex justify-end">
                <button type="button" onClick={seguirAlTrato} disabled={busy || !lookup} className={BOTON_BLANCO}>
                  Seguir
                </button>
              </div>
            </div>
          )}
        </li>

        {/* 3 · Trato y nombre */}
        <li className={cn("rounded-xl border bg-surface px-4 py-3.5", paso === "trato" ? "border-info-line" : "border-line")}>
          <div className="flex items-center gap-3">
            <Numero n={3} hecho={false} activo={paso === "trato"} />
            <span className={ROTULO}>3 · Trato y nombre</span>
          </div>
          {paso === "trato" && lookup?.company && (
            <div className="mt-3.5 flex flex-col gap-3.5">
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-[13px] font-semibold text-fg">
                  ¿A qué trato de HubSpot va? <span className="font-normal text-fg-muted">Opcional</span>
                </legend>
                {lookup.deals.map((d) => (
                  <label
                    key={d.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]",
                      dealId === d.id ? "border-info-line bg-info-surface" : "border-line bg-surface hover:bg-surface-hover",
                    )}
                  >
                    <input type="radio" name="trato" checked={dealId === d.id} onChange={() => elegirTrato(d)} />
                    <span className="flex-1">
                      <span className="font-semibold text-fg">{d.name}</span>
                      {(d.stage || d.isWon) && <span className="text-fg-muted"> · {d.stage ?? "ganado"}</span>}
                      {d.pipeline && <span className="block text-xs text-fg-muted">{d.pipeline}</span>}
                    </span>
                  </label>
                ))}
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-fg-muted",
                    dealId === "" ? "border-info-line bg-info-surface" : "border-line bg-surface-muted",
                  )}
                >
                  <input type="radio" name="trato" checked={dealId === ""} onChange={() => elegirTrato(null)} />
                  Todavía no hay trato
                </label>
              </fieldset>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-fg">Nombre de la propuesta</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-fg focus:border-brand focus:outline-none"
                />
                <span className="text-xs text-fg-muted">Lo ve el cliente en el título del link. Sale del trato si eliges uno.</span>
              </label>
              {lookup.existingClientName && (
                <span className="text-xs text-fg-muted">
                  Ya está en Nexus como <span className="font-medium text-fg-secondary">{lookup.existingClientName}</span>: se usa esa ficha.
                </span>
              )}
              <div className="flex justify-end">
                <button type="button" onClick={() => void crear()} disabled={busy} className={BOTON_AZUL}>
                  {busy ? "Creando…" : "Crear la propuesta"}
                </button>
              </div>
            </div>
          )}
        </li>
      </ol>
    </div>
  );
}

function Numero({ n, hecho, activo }: { n: number; hecho: boolean; activo: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold",
        hecho
          ? "border border-success-line bg-success-surface text-success-ink"
          : activo
            ? "bg-primary text-primary-fg"
            : "border border-dashed border-line text-fg-muted",
      )}
    >
      {hecho ? "✓" : n}
    </span>
  );
}
