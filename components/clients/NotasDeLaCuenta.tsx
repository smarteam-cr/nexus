"use client";

/**
 * components/clients/NotasDeLaCuenta.tsx — La cuenta › Notas (etapa 5 de docs/mi-dia-plan.md).
 *
 * Arriba se anota lo que pasó por WhatsApp, una llamada, un correo o en persona: va a HubSpot como nota de la empresa (a
 * nombre de quien la escribe) y Nexus la lee como contexto de la cuenta. Abajo, las notas de Nexus y, aparte, las que
 * se escribieron directo en el registro de HubSpot (solo para leer).
 *
 * Datos: GET/POST /api/clients/[id]/notas · PATCH /api/clients/[id]/notas/[notaId]. Reglas: lib/notas/.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, ConfirmDialog, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "@/hooks/useMe";
import { cn } from "@/lib/cn";
import { hubspotRecordUrl } from "@/lib/hubspot/urls";
import {
  CANALES_A_MANO,
  ETIQUETA_DEL_CANAL,
  MAX_TEXTO_DE_LA_NOTA,
  diaDeCostaRica,
  diaEnPalabras,
  estadoEnHubspotEnPalabras,
} from "@/lib/notas/reglas";
import type { NotaEnPantalla, NotasDeLaCuenta as Datos } from "@/lib/notas/lectura-server";

type CanalAMano = (typeof CANALES_A_MANO)[number];
const PUEDEN_SACAR_AJENAS = new Set(["CSL", "SUPER_ADMIN"]);

export default function NotasDeLaCuenta({ clientId, proyectos }: { clientId: string; proyectos: { id: string; nombre: string }[] }) {
  const me = useMe();
  const toast = useToast();
  const [datos, setDatos] = useState<(Datos & { portalId: string | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canal, setCanal] = useState<CanalAMano>("whatsapp");
  const [fecha, setFecha] = useState(() => diaDeCostaRica(new Date()));
  const [texto, setTexto] = useState("");
  const [projectId, setProjectId] = useState("");
  const [negocioId, setNegocioId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorDelFormulario, setErrorDelFormulario] = useState<string | null>(null);
  const [aSacar, setASacar] = useState<NotaEnPantalla | null>(null);
  const [reintentando, setReintentando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/clients/${clientId}/notas`, { cache: "no-store" });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudieron cargar las notas.");
      setDatos(await r.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las notas.");
    }
  }, [clientId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hoy = useMemo(() => diaDeCostaRica(new Date()), []);

  async function guardar() {
    if (!texto.trim()) {
      setErrorDelFormulario("Escribe qué pasó.");
      return;
    }
    setGuardando(true);
    setErrorDelFormulario(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal, fecha, texto, projectId: projectId || null, negocioId: negocioId || null }),
      });
      const d = (await r.json().catch(() => null)) as { error?: string; hubspotEstado?: string } | null;
      if (!r.ok) throw new Error(d?.error ?? "No se pudo guardar la nota.");
      setTexto("");
      if (d?.hubspotEstado === "escrita") toast.success("Nota guardada y escrita en HubSpot.");
      else if (d?.hubspotEstado === "sin_hubspot") toast.success("Nota guardada. La empresa no está en HubSpot: queda solo en Nexus.");
      else toast.info("Nota guardada. HubSpot no respondió: se reintenta cada hora.");
      await cargar();
    } catch (e) {
      setErrorDelFormulario(e instanceof Error ? e.message : "No se pudo guardar la nota.");
    } finally {
      setGuardando(false);
    }
  }

  async function sacar(nota: NotaEnPantalla) {
    const r = await fetch(`/api/clients/${clientId}/notas/${nota.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "sacar" }),
    });
    const d = (await r.json().catch(() => null)) as { error?: string } | null;
    setASacar(null);
    if (!r.ok) {
      toast.error(d?.error ?? "No se pudo sacar la nota.");
      return;
    }
    toast.success("La nota salió de Nexus. En HubSpot queda.");
    await cargar();
  }

  async function reintentar(nota: NotaEnPantalla) {
    setReintentando(nota.id);
    try {
      const r = await fetch(`/api/clients/${clientId}/notas/${nota.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "reintentar" }),
      });
      const d = (await r.json().catch(() => null)) as { error?: string; hubspotEstado?: string } | null;
      if (!r.ok) toast.error(d?.error ?? "No se pudo reintentar.");
      else if (d?.hubspotEstado === "escrita") toast.success("Ya está en HubSpot.");
      else toast.error("HubSpot sigue sin responder. Se reintenta cada hora.");
      await cargar();
    } finally {
      setReintentando(null);
    }
  }

  const encabezado = (
    <div>
      <h2 className="text-[22px] font-bold leading-tight text-fg">Notas</h2>
      <p className="mt-1 max-w-3xl text-[13px] text-fg-muted">
        Lo que pasó por WhatsApp, una llamada, un correo o en persona. Va a HubSpot como nota de la empresa, a tu nombre, y
        Nexus la lee como contexto de la cuenta. La ve todo el que ve la cuenta; el cliente, nunca.
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
        <SkeletonPanel minH="min-h-[180px]">
          <SkeletonText lines={4} />
        </SkeletonPanel>
        <SkeletonPanel minH="min-h-[200px]">
          <SkeletonText lines={5} />
        </SkeletonPanel>
      </div>
    );
  }
  if (!datos.hayTabla) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6">
        {encabezado}
        <EmptyState title="Todavía no se puede anotar" description="Falta la tabla de las notas en la base (scripts/sql/2026-10-16-notas-de-la-cuenta.sql)." />
      </div>
    );
  }

  const puedeSacar = (n: NotaEnPantalla) => !!me && (n.autorEmail === me.email.toLowerCase() || PUEDEN_SACAR_AJENAS.has(me.role ?? ""));
  const enlaceDeLaEmpresa = datos.portalId && datos.hubspotCompanyId ? hubspotRecordUrl(datos.portalId, "0-2", datos.hubspotCompanyId) : null;

  return (
    <div className="space-y-6 px-8 pb-10 pt-6">
      {encabezado}

      <section aria-labelledby="anotar" className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <h3 id="anotar" className="text-sm font-semibold text-fg">
          Anotar
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Por dónde fue">
            <Select value={canal} onChange={(e) => setCanal(e.target.value as CanalAMano)}>
              {CANALES_A_MANO.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_DEL_CANAL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cuándo">
            <Input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Proyecto" hint="Opcional">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Toda la cuenta</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Negocio" hint={datos.negocios.length ? "Opcional" : "Sin negocios abiertos"}>
            <Select value={negocioId} onChange={(e) => setNegocioId(e.target.value)} disabled={!datos.negocios.length}>
              <option value="">Ninguno</option>
              {datos.negocios.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Qué pasó" error={errorDelFormulario} hint={`${texto.length} de ${MAX_TEXTO_DE_LA_NOTA}`}>
          <Textarea
            rows={4}
            value={texto}
            maxLength={MAX_TEXTO_DE_LA_NOTA}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej.: Ana confirmó por WhatsApp que el lunes manda la base de contactos."
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-fg-muted">
            {datos.hubspotCompanyId ? "Se escribe en HubSpot a tu nombre." : "La empresa no está en HubSpot: la nota queda solo en Nexus."}
          </p>
          <Button onClick={guardar} disabled={guardando || !texto.trim()}>
            {guardando ? "Guardando…" : "Guardar nota"}
          </Button>
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="notas-de-nexus">
        <div className="flex items-baseline gap-2">
          <h3 id="notas-de-nexus" className="text-sm font-semibold text-fg">
            Del equipo
          </h3>
          <span className="text-xs text-fg-muted">{datos.notas.length} · la más nueva primero</span>
        </div>
        {datos.notas.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Todavía no hay notas de esta cuenta.</p>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {datos.notas.map((n) => (
              <article key={n.id} className="space-y-1.5 px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-semibold text-fg">
                    {ETIQUETA_DEL_CANAL[n.canal]} · {diaEnPalabras(n.fecha)} <span className="font-normal text-fg-muted">· {n.autor}</span>
                  </p>
                  <EstadoEnHubspot nota={n} reintentando={reintentando === n.id} onReintentar={() => reintentar(n)} />
                </div>
                {(n.proyecto || n.negocio || n.reunion) && (
                  <p className="text-xs text-fg-muted">
                    {[
                      n.reunion ? `De la reunión «${n.reunion.titulo}»` : null,
                      n.proyecto ? `Proyecto «${n.proyecto.nombre}»` : null,
                      n.negocio ? `Negocio «${n.negocio}»` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-fg-secondary">{n.texto}</p>
                {puedeSacar(n) && (
                  <button type="button" onClick={() => setASacar(n)} className="text-xs font-semibold text-fg-muted transition-colors hover:text-fg">
                    Sacar de Nexus
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="notas-de-hubspot">
        <div className="flex items-baseline gap-2">
          <h3 id="notas-de-hubspot" className="text-sm font-semibold text-fg">
            Escritas en HubSpot
          </h3>
          {datos.deHubspot && <span className="text-xs text-fg-muted">{datos.deHubspot.length} · las más recientes del registro de la empresa</span>}
          {enlaceDeLaEmpresa && (
            <a href={enlaceDeLaEmpresa} target="_blank" rel="noreferrer" className="ml-auto text-xs font-semibold text-brand transition-colors hover:text-brand-light">
              Abrir en HubSpot
            </a>
          )}
        </div>
        {datos.errorDeHubspot ? (
          <Alert variant="warning">No se pudo leer el registro de HubSpot: {datos.errorDeHubspot}. Las notas de Nexus se ven igual.</Alert>
        ) : datos.deHubspot === null ? (
          <p className="text-[13px] text-fg-muted">La empresa no está en HubSpot.</p>
        ) : datos.deHubspot.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No hay notas escritas directo en HubSpot.</p>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {datos.deHubspot.map((n) => (
              <article key={n.id} className="space-y-1 px-4 py-3 text-[13px]">
                <p className="text-xs font-semibold text-fg-muted">{diaEnPalabras(diaDeCostaRica(new Date(n.fecha)))}</p>
                <p className="whitespace-pre-wrap text-fg-secondary">{n.texto}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!aSacar}
        title="¿Sacar la nota de Nexus?"
        description="Deja de verse acá y Nexus deja de leerla como contexto de la cuenta. En HubSpot queda: si hace falta, bórrala allá."
        confirmLabel="Sacar de Nexus"
        onCancel={() => setASacar(null)}
        onConfirm={() => (aSacar ? sacar(aSacar) : undefined)}
      />
    </div>
  );
}

function EstadoEnHubspot({ nota, reintentando, onReintentar }: { nota: NotaEnPantalla; reintentando: boolean; onReintentar: () => void }) {
  const problema = nota.hubspotEstado === "error" || (nota.hubspotEstado === "escrita" && !!nota.hubspotError);
  return (
    <span className={cn("flex items-center gap-2 text-xs", problema ? "text-warn-ink" : "text-fg-muted")} title={nota.hubspotError ?? undefined}>
      {nota.hubspotEstado === "escrita" && nota.hubspotError ? nota.hubspotError : estadoEnHubspotEnPalabras(nota.hubspotEstado, nota.hubspotIntentos)}
      {(nota.hubspotEstado === "error" || nota.hubspotEstado === "pendiente") && (
        <button type="button" onClick={onReintentar} disabled={reintentando} className="font-semibold text-brand transition-colors hover:text-brand-light disabled:opacity-60">
          {reintentando ? "Reintentando…" : "Reintentar"}
        </button>
      )}
    </span>
  );
}
