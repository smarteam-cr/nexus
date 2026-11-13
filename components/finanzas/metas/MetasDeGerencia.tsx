"use client";

/**
 * components/finanzas/metas/MetasDeGerencia.tsx — Finanzas › Metas y bonos (/finanzas/goals, 2026-11-13). SOLO
 * DIRECCIÓN.
 *
 * Una tarjeta por meta: cuánto se lleva contra el objetivo, qué falta, cuándo es el corte, y debajo cómo se mide y de
 * dónde sale el número. Lo que HubSpot no expone (el requisito exacto, el período, el corte, o el avance si no hay
 * cómo leerlo) se carga en «Editar». La cuenta vive en lib/finanzas/metas-de-gerencia.ts.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Selector, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { enCuanto, fmtDia, fmtMonto, miles } from "@/lib/cs/formato";
import { DEFINICION_DE_MEDIDA, MEDIDAS, leerMontoEscrito, type Medida } from "@/lib/finanzas/metas-de-gerencia";
import type { MetaDeGerenciaDTO, MetasDeGerencia as Datos } from "@/lib/finanzas/metas-de-gerencia-server";

const pct = (x: number) => `${Math.round(x * 100)} %`;

export default function MetasDeGerencia({ datos }: { datos: Datos }) {
  const [editando, setEditando] = useState<MetaDeGerenciaDTO | "nueva" | null>(null);
  const hoy = datos.hoy;
  return (
    <>
      <PageHeader
        title="Metas y bonos"
        description="Las metas que dan plata: cómo vamos contra cada una, qué falta y de dónde sale cada número."
        action={
          datos.metas && (
            <Button variant="primary" onClick={() => setEditando("nueva")}>
              Nueva meta
            </Button>
          )
        }
      />
      <div className="space-y-4">
        {datos.comisionMensualHubspot !== null && datos.ultimaCopiaPartner && (
          <p className="text-[13px] text-fg-secondary">
            HubSpot proyecta hoy <b className="text-fg">{fmtMonto(datos.comisionMensualHubspot)} al mes</b> de comisión para Smarteam (copia de Partner del{" "}
            {fmtDia(datos.ultimaCopiaPartner, hoy)}). Es lo que cuidan las metas de partner.
          </p>
        )}
        {datos.metas === null ? (
          <Alert variant="warning" title="Falta aplicar el SQL de las metas.">
            Hasta que se corra scripts/sql/2026-11-13-metas-de-gerencia.sql, esta pantalla no puede guardar ni mostrar metas.
          </Alert>
        ) : datos.metas.length === 0 ? (
          <EmptyState
            variant="dashed"
            title="No hay metas"
            description="Agrega una meta para seguir su avance."
            action={
              <Button variant="primary" onClick={() => setEditando("nueva")}>
                Nueva meta
              </Button>
            }
          />
        ) : (
          datos.metas.map((m) => <TarjetaDeMeta key={m.id} meta={m} hoy={hoy} onEditar={() => setEditando(m)} />)
        )}
      </div>
      {editando && <EditorDeMeta meta={editando === "nueva" ? null : editando} onCerrar={() => setEditando(null)} />}
    </>
  );
}

function TarjetaDeMeta({ meta, hoy, onEditar }: { meta: MetaDeGerenciaDTO; hoy: string; onEditar: () => void }) {
  const { lectura, estado, definicion } = meta;
  const ancho = estado.pct === null ? 0 : Math.min(1, Math.max(0, estado.pct));
  const titulo = `meta-${meta.id}`;
  return (
    <section aria-labelledby={titulo} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titulo} className="text-sm font-semibold text-fg">
            {meta.nombre}
          </h2>
          {(meta.premio || meta.paraQuien) && (
            <p className="text-xs text-fg-muted">
              {meta.premio}
              {meta.premio && meta.paraQuien ? " · " : ""}
              {meta.paraQuien && <>Para {meta.paraQuien}.</>}
            </p>
          )}
        </div>
        <Button size="sm" onClick={onEditar}>
          Editar
        </Button>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{lectura.valor === null ? "—" : fmtMonto(lectura.valor)}</span>
        {meta.objetivoUsd !== null ? (
          <span className="text-[13px] text-fg-secondary">
            de {fmtMonto(meta.objetivoUsd)}
            {estado.pct !== null && <> · {pct(estado.pct)}</>}
          </span>
        ) : (
          <span className="text-[13px] text-fg-secondary">Falta cargar el objetivo.</span>
        )}
      </div>

      {meta.objetivoUsd !== null && (
        <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
          <span className={cn("absolute inset-y-0 left-0 rounded-full", estado.cumplida ? "bg-success" : "bg-brand")} style={{ width: `${ancho * 100}%` }} />
          {estado.tiempoPct !== null && estado.tiempoPct < 1 && (
            <span className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${estado.tiempoPct * 100}%` }} title="Cuánto del período ya pasó" />
          )}
        </div>
      )}

      <p className="text-[13px] text-fg-secondary">
        {lineaDeEstado(meta, hoy).map((parte, i) => (
          <span key={i}>
            {i > 0 && " · "}
            {parte}
          </span>
        ))}
      </p>

      {lectura.aviso && <Alert variant="warning">{lectura.aviso}</Alert>}

      <div className="space-y-1 rounded-lg bg-surface-muted p-3 text-xs text-fg-secondary">
        <p>
          <b className="text-fg">Cómo se mide: {definicion.etiqueta.toLowerCase()}.</b> {definicion.queMide}
        </p>
        <p>
          <b className="text-fg">De dónde sale:</b> {definicion.deDondeSale}
          {lectura.al && <> Dato del {fmtDia(lectura.al, hoy)}.</>}
        </p>
        {lectura.detalle.map((d) => (
          <p key={d}>{d}</p>
        ))}
      </div>

      {meta.nota && (
        <p className="text-xs text-fg-muted">
          <b className="text-fg-secondary">Nota:</b> {meta.nota}
        </p>
      )}
      <p className="text-xs text-fg-muted">
        Última edición: {meta.actualizadaPor.startsWith("nexus:") ? "cargada por Nexus" : meta.actualizadaPor} el {fmtDia(meta.actualizadaEn, hoy)}.
      </p>
    </section>
  );
}

/** «Falta US$7.000 · Período: 1 sep – 31 dic (va el 60 % del tiempo) · Corte: 31 dic, en 48 días». */
function lineaDeEstado(meta: MetaDeGerenciaDTO, hoy: string): string[] {
  const partes: string[] = [];
  const { estado } = meta;
  if (estado.cumplida) partes.push("Cumplida");
  else if (estado.falta !== null) partes.push(`Falta ${fmtMonto(estado.falta)}`);
  if (meta.definicion.forma === "acumulado" && meta.desde && meta.hasta) {
    const tiempo = estado.tiempoPct !== null && estado.tiempoPct > 0 && estado.tiempoPct < 1 ? ` (va el ${pct(estado.tiempoPct)} del tiempo)` : "";
    partes.push(`Período: ${fmtDia(meta.desde, hoy)} – ${fmtDia(meta.hasta, hoy)}${tiempo}`);
  } else {
    partes.push("Se mide lo que hay hoy");
  }
  if (meta.corteEn) {
    const d = estado.diasAlCorte ?? 0;
    partes.push(d < 0 ? `Corte: ${fmtDia(meta.corteEn, hoy)}, ya pasó` : `Corte: ${fmtDia(meta.corteEn, hoy)}, ${enCuanto(meta.corteEn, hoy)}`);
  } else {
    partes.push("Sin fecha de corte");
  }
  return partes;
}

// ── El editor ───────────────────────────────────────────────────────────────────────────────────────────────────────

const OPCIONES_DE_MEDIDA = MEDIDAS.map((m) => ({
  value: m,
  label: DEFINICION_DE_MEDIDA[m].etiqueta,
  hint: DEFINICION_DE_MEDIDA[m].forma === "acumulado" ? "Suma dentro del período" : "Lo que hay hoy",
}));

function EditorDeMeta({ meta, onCerrar }: { meta: MetaDeGerenciaDTO | null; onCerrar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [nombre, setNombre] = useState(meta?.nombre ?? "");
  const [medida, setMedida] = useState<Medida>(meta?.medida ?? "manual");
  const [objetivo, setObjetivo] = useState(meta?.objetivoUsd !== null && meta?.objetivoUsd !== undefined ? miles(meta.objetivoUsd) : "");
  const [desde, setDesde] = useState(meta?.desde ?? "");
  const [hasta, setHasta] = useState(meta?.hasta ?? "");
  const [corteEn, setCorteEn] = useState(meta?.corteEn ?? "");
  const [premio, setPremio] = useState(meta?.premio ?? "");
  const [paraQuien, setParaQuien] = useState(meta?.paraQuien ?? "");
  const [avance, setAvance] = useState(meta?.avanceManualUsd !== null && meta?.avanceManualUsd !== undefined ? String(meta.avanceManualUsd) : "");
  const [avanceAl, setAvanceAl] = useState(meta?.avanceManualAl ?? "");
  const [nota, setNota] = useState(meta?.nota ?? "");
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const definicion = DEFINICION_DE_MEDIDA[medida];

  const guardar = async () => {
    const objetivoUsd = leerMontoEscrito(objetivo);
    const avanceManualUsd = leerMontoEscrito(avance);
    if (objetivo.trim() && (objetivoUsd === null || objetivoUsd <= 0)) return toast.error("Escribe el objetivo en dólares.");
    setGuardando(true);
    try {
      const r = await fetch(meta ? `/api/cobranza/costos/goals/${encodeURIComponent(meta.id)}` : "/api/cobranza/costos/goals", {
        method: meta ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          medida,
          objetivoUsd,
          desde: desde || null,
          hasta: hasta || null,
          corteEn: corteEn || null,
          premio,
          paraQuien,
          avanceManualUsd: medida === "manual" ? avanceManualUsd : null,
          avanceManualAl: medida === "manual" ? avanceAl || null : null,
          nota,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo guardar la meta.");
      toast.success(meta ? "Meta guardada." : "Meta agregada.");
      onCerrar();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la meta.");
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    if (!meta) return;
    const r = await fetch(`/api/cobranza/costos/goals/${encodeURIComponent(meta.id)}`, { method: "DELETE" });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      toast.error(j.error ?? "No se pudo quitar la meta.");
      return;
    }
    toast.success("Meta quitada.");
    setQuitando(false);
    onCerrar();
    router.refresh();
  };

  return (
    <>
      <Modal
        open
        onClose={onCerrar}
        size="lg"
        title={meta ? "Editar la meta" : "Nueva meta"}
        description="Nexus mide el avance; acá va lo que HubSpot no muestra: el objetivo exacto, el período y el corte."
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            {meta && (
              <Button variant="destructive" onClick={() => setQuitando(true)} disabled={guardando}>
                Quitar la meta
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button onClick={onCerrar} disabled={guardando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={guardar} loading={guardando}>
                Guardar
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre" required>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Mantener el nivel Elite de HubSpot" />
          </Field>
          <Field label="Cómo se mide" hint={definicion.queMide}>
            <Selector opciones={OPCIONES_DE_MEDIDA} valor={medida} placeholder="Elige cómo se mide" etiqueta="Cómo se mide" onElegir={(v) => setMedida(v as Medida)} />
          </Field>
          <Field label="Objetivo en dólares" hint="El requisito o la meta exacta, como la dice HubSpot o como se acordó.">
            <Input inputMode="decimal" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="32.588" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Desde" hint={definicion.forma === "acumulado" ? "Obligatorio para esta medida." : "No se usa para esta medida."}>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </Field>
            <Field label="Fecha de corte" hint="Cuándo se revisa si se cumplió.">
              <Input type="date" value={corteEn} onChange={(e) => setCorteEn(e.target.value)} />
            </Field>
          </div>
          {medida === "manual" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Avance en dólares" required>
                <Input inputMode="decimal" value={avance} onChange={(e) => setAvance(e.target.value)} />
              </Field>
              <Field label="A qué día corresponde" required>
                <Input type="date" value={avanceAl} onChange={(e) => setAvanceAl(e.target.value)} />
              </Field>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Qué da cumplirla (opcional)">
              <Input value={premio} onChange={(e) => setPremio(e.target.value)} placeholder="Bono del 15 % de HubSpot." />
            </Field>
            <Field label="Para quién (opcional)">
              <Input value={paraQuien} onChange={(e) => setParaQuien(e.target.value)} placeholder="Nombres de quienes reciben el bono" />
            </Field>
          </div>
          <Field label="Nota (opcional)" hint="Lo que falta confirmar, o con quién se acordó.">
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={quitando}
        title="¿Quitar esta meta?"
        description="Deja de verse en Metas y bonos. Queda guardada en la base."
        confirmLabel="Quitar"
        variant="destructive"
        onConfirm={quitar}
        onCancel={() => setQuitando(false)}
        z="z-[60]"
      />
    </>
  );
}
