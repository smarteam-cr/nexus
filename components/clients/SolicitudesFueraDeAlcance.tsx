"use client";

/**
 * components/clients/SolicitudesFueraDeAlcance.tsx — La cuenta › Fuera de alcance (2026-10-07).
 *
 * Todas las solicitudes fuera de alcance del cliente, de todos sus proyectos, para darles seguimiento
 * sin un Excel (pedido de Elías). Las que detectó Nexus en una reunión llegan «por revisar» y el CSE
 * las confirma o las descarta; al confirmar una les avisamos a Customer Success y al vendedor dueño
 * de la empresa. También se suman a mano las que no salieron de una reunión.
 *
 * Datos: GET/POST /api/clients/[id]/solicitudes-fuera-de-alcance y PATCH …/[solicitudId].
 * Reglas: lib/sessions/solicitudes-fuera-de-alcance.ts. Interno: nada de esto ve el cliente.
 */
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Field, Input, Segmentado, Select, Textarea, useToast } from "@/components/ui";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import {
  accionesDeSolicitud,
  ESTADOS_ABIERTOS,
  ROTULO_DE_SOLICITUD,
  type EstadoDeSolicitud,
} from "@/lib/sessions/solicitudes-fuera-de-alcance";
import type { ResultadoDelAviso, SolicitudEnPantalla } from "@/lib/sessions/solicitudes-server";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** La fecha en la hora de Costa Rica (UTC-6), armada a mano: así servidor y navegador dicen lo mismo. */
function fecha(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

async function leerError(r: Response, porDefecto: string): Promise<string> {
  const j = (await r.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? porDefecto;
}

/** Lo que le decimos a la persona después de confirmar: a quién le llegó el aviso. */
export function avisarDelAviso(toast: ReturnType<typeof useToast>, aviso: ResultadoDelAviso | null | undefined) {
  if (!aviso) return;
  if (aviso.avisados > 0) toast.success("Confirmada. Les avisamos a Customer Success y al vendedor.");
  else toast.success("Confirmada.");
  if (aviso.sinVendedor) toast.info(aviso.sinVendedor);
}

function ChipDeSolicitud({ s }: { s: SolicitudEnPantalla }) {
  // «Por revisar» y detectada por Nexus = lo que sugirió la IA: azul, con su chispa (sistema interno).
  if (s.estado === "PEDIDO" && !s.creadoPor) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-info-line bg-info-surface px-2 py-0.5 text-[11px] font-medium text-brand">
        <IconoDeSugerencia className="h-3 w-3" />
        Por revisar
      </span>
    );
  }
  const abierta = (ESTADOS_ABIERTOS as readonly string[]).includes(s.estado);
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium",
        abierta ? "border-line bg-surface text-fg" : "border-line bg-surface-muted text-fg-muted",
      )}
    >
      {ROTULO_DE_SOLICITUD[s.estado]}
    </span>
  );
}

function TarjetaDeSolicitud({
  s,
  ocupado,
  onCambiar,
}: {
  s: SolicitudEnPantalla;
  ocupado: boolean;
  onCambiar: (cambio: { estado?: EstadoDeSolicitud; nota?: string }) => Promise<void>;
}) {
  const [nota, setNota] = useState(s.nota ?? "");
  // Si la nota guardada cambia desde afuera, el campo la toma (ajuste en el render, sin efecto).
  const [notaGuardada, setNotaGuardada] = useState(s.nota);
  if (notaGuardada !== s.nota) {
    setNotaGuardada(s.nota);
    setNota(s.nota ?? "");
  }
  const meta = [
    s.quienLoPidio && `Lo pidió: ${s.quienLoPidio}`,
    s.monto && `Monto: ${s.monto}`,
    s.proyecto ? s.proyecto.nombre : "Sin proyecto",
  ].filter(Boolean);
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-medium leading-snug text-fg">{s.pedido}</p>
            <ChipDeSolicitud s={s} />
          </div>
          <p className="text-xs text-fg-muted">{meta.join(" · ")}</p>
          {s.cita && <p className="text-xs italic text-fg-secondary">«{s.cita}»</p>}
          <p className="text-xs text-fg-muted">
            {s.creadoPor ? (
              `La sumó ${s.creadoPor} el ${fecha(s.createdAt)}`
            ) : s.reunion ? (
              <>
                La detectó Nexus en{" "}
                <Link href={`/sessions/${s.reunion.id}`} className="text-brand hover:underline">
                  {s.reunion.titulo ?? "una reunión"}
                </Link>{" "}
                ({fecha(s.reunion.fecha)})
              </>
            ) : (
              `La detectó Nexus el ${fecha(s.createdAt)}`
            )}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
          {accionesDeSolicitud(s.estado).map((a) => (
            <BotonBlanco key={a.estado} disabled={ocupado} onClick={() => void onCambiar({ estado: a.estado })}>
              {a.label}
            </BotonBlanco>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <Field label="Seguimiento" hint="En qué quedó y qué falta. Se guarda al salir del campo.">
          <Textarea
            rows={2}
            value={nota}
            placeholder="Andrés la cotizó el 8 de octubre; el cliente responde la semana que viene."
            onChange={(e) => setNota(e.target.value)}
            onBlur={() => {
              if (nota.trim() !== (s.nota ?? "").trim()) void onCambiar({ nota: nota.trim() });
            }}
          />
        </Field>
      </div>

      {s.historial.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-fg-muted hover:text-fg">Historial ({s.historial.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {[...s.historial].reverse().map((h, i) => (
              <li key={i} className="text-xs text-fg-secondary">
                {fecha(h.en)} · {ROTULO_DE_SOLICITUD[h.estado]} · {h.por}
                {h.nota ? ` — ${h.nota}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function SumarSolicitud({
  proyectos,
  onSumar,
  onCancelar,
}: {
  proyectos: Array<{ id: string; nombre: string }>;
  onSumar: (alta: { pedido: string; quienLoPidio: string; monto: string; nota: string; projectId: string | null }) => Promise<boolean>;
  onCancelar: () => void;
}) {
  const [pedido, setPedido] = useState("");
  const [quien, setQuien] = useState("");
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [proyecto, setProyecto] = useState(proyectos.length === 1 ? proyectos[0].id : "");
  const [guardando, setGuardando] = useState(false);
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">Sumar una solicitud</h3>
      <p className="text-xs text-fg-muted">
        Para lo que el cliente pidió fuera de una reunión grabada. Entra confirmada y les avisamos a Customer Success y al vendedor.
      </p>
      <Field label="Qué pidió" required>
        <Input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Integrar el ERP con HubSpot" />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Quién lo pidió">
          <Input value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="Nombre y cargo" />
        </Field>
        <Field label="Monto u horas">
          <Input value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Si se habló" />
        </Field>
        <Field label="Proyecto">
          <Select value={proyecto} onChange={(e) => setProyecto(e.target.value)}>
            <option value="">Sin proyecto</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Seguimiento">
        <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="En qué quedó y qué falta" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <BotonAzul
          disabled={guardando || !pedido.trim()}
          onClick={async () => {
            setGuardando(true);
            const ok = await onSumar({ pedido: pedido.trim(), quienLoPidio: quien.trim(), monto: monto.trim(), nota: nota.trim(), projectId: proyecto || null });
            setGuardando(false);
            if (ok) onCancelar();
          }}
        >
          {guardando ? "Guardando…" : "Sumarla"}
        </BotonAzul>
        <BotonTexto onClick={onCancelar}>Cancelar</BotonTexto>
      </div>
    </section>
  );
}

export default function SolicitudesFueraDeAlcance({
  clientId,
  proyectos,
  slotDelPanel = null,
}: {
  clientId: string;
  proyectos: Array<{ id: string; nombre: string }>;
  /** El panel de la derecha de la ficha (null con el panel oculto). */
  slotDelPanel?: HTMLElement | null;
}) {
  const toast = useToast();
  const [solicitudes, setSolicitudes] = useState<SolicitudEnPantalla[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<"abiertas" | "todas">("abiertas");
  const [sumando, setSumando] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const base = `/api/clients/${encodeURIComponent(clientId)}/solicitudes-fuera-de-alcance`;
  const cargar = useCallback(async () => {
    try {
      const r = await fetch(base, { cache: "no-store" });
      if (!r.ok) throw new Error(await leerError(r, "No se pudieron leer las solicitudes."));
      setSolicitudes(((await r.json()) as { solicitudes: SolicitudEnPantalla[] }).solicitudes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las solicitudes.");
    }
  }, [base]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abiertas = useMemo(() => (solicitudes ?? []).filter((s) => (ESTADOS_ABIERTOS as readonly string[]).includes(s.estado)), [solicitudes]);
  const porRevisar = abiertas.filter((s) => s.estado === "PEDIDO").length;
  const enSeguimiento = abiertas.length - porRevisar;
  const lista = vista === "abiertas" ? abiertas : (solicitudes ?? []);

  const cambiar = async (id: string, cambio: { estado?: EstadoDeSolicitud; nota?: string }) => {
    setOcupada(id);
    try {
      const r = await fetch(`${base}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambio),
      });
      if (!r.ok) throw new Error(await leerError(r, "No se pudo guardar."));
      const { solicitud, aviso } = (await r.json()) as { solicitud: SolicitudEnPantalla; aviso: ResultadoDelAviso | null };
      setSolicitudes((xs) => (xs ? xs.map((x) => (x.id === id ? solicitud : x)) : xs));
      if (aviso) avisarDelAviso(toast, aviso);
      else if (cambio.nota !== undefined && !cambio.estado) toast.success("Guardaste el seguimiento.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setOcupada(null);
    }
  };

  const sumar = async (alta: { pedido: string; quienLoPidio: string; monto: string; nota: string; projectId: string | null }) => {
    try {
      const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alta) });
      if (!r.ok) throw new Error(await leerError(r, "No se pudo sumar la solicitud."));
      const { solicitud, aviso } = (await r.json()) as { solicitud: SolicitudEnPantalla; aviso: ResultadoDelAviso };
      setSolicitudes((xs) => [solicitud, ...(xs ?? [])]);
      avisarDelAviso(toast, aviso);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo sumar la solicitud.");
      return false;
    }
  };

  const panel = slotDelPanel
    ? createPortal(
        <QueSigue>
          {solicitudes === null
            ? "Leyendo las solicitudes…"
            : porRevisar > 0
              ? `${porRevisar === 1 ? "Hay 1 solicitud" : `Hay ${porRevisar} solicitudes`} por revisar. Confírmala${porRevisar === 1 ? "" : "s"} o descártala${porRevisar === 1 ? "" : "s"}: al confirmar una les avisamos a Customer Success y al vendedor.`
              : enSeguimiento > 0
                ? `${enSeguimiento === 1 ? "1 solicitud" : `${enSeguimiento} solicitudes`} en seguimiento. Anota en qué quedó cada una.`
                : "No hay solicitudes abiertas."}
        </QueSigue>,
        slotDelPanel,
      )
    : null;

  return (
    <div className="space-y-5">
      {panel}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-[15px] font-semibold text-fg">Solicitudes fuera de alcance</h2>
          <p className="max-w-2xl text-[13px] text-fg-secondary">
            Lo que el cliente pidió y no está en lo vendido, de todos sus proyectos. Nexus las detecta en las reuniones; tú las
            confirmas o las descartas y les das seguimiento. El cliente no ve esta lista.
          </p>
        </div>
        {!sumando && <BotonBlanco onClick={() => setSumando(true)}>Sumar una solicitud</BotonBlanco>}
      </header>

      {sumando && <SumarSolicitud proyectos={proyectos} onSumar={sumar} onCancelar={() => setSumando(false)} />}

      {error && <p className="text-[13px] text-danger-ink">{error}</p>}

      {solicitudes === null && !error ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <SkeletonPanel key={i} minH="min-h-[150px]" bodyClassName="p-4 space-y-3">
              <SkeletonText lines={3} />
            </SkeletonPanel>
          ))}
        </div>
      ) : solicitudes && solicitudes.length === 0 ? (
        <EmptyState
          title="Sin solicitudes fuera de alcance"
          description="Cuando el cliente pida algo que no está en lo vendido, Nexus lo detecta en la reunión y aparece acá."
        />
      ) : (
        solicitudes && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Segmentado
                etiqueta="Qué solicitudes ver"
                opciones={[
                  { clave: "abiertas", etiqueta: `Abiertas (${abiertas.length})` },
                  { clave: "todas", etiqueta: `Todas (${solicitudes.length})` },
                ]}
                valor={vista}
                onCambio={(v) => setVista(v)}
              />
              <span className={ROTULO_DEL_SISTEMA}>
                {porRevisar} por revisar · {enSeguimiento} en seguimiento
              </span>
            </div>
            {lista.length === 0 ? (
              <p className="text-[13px] text-fg-muted">No hay solicitudes abiertas. Las cerradas están en «Todas».</p>
            ) : (
              <div className="space-y-3">
                {lista.map((s) => (
                  <TarjetaDeSolicitud key={s.id} s={s} ocupado={ocupada === s.id} onCambiar={(c) => cambiar(s.id, c)} />
                ))}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
