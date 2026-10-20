"use client";

/**
 * components/landing/hero-parts.tsx
 *
 * Primitivas COMPARTIDAS del above-the-fold, extraídas de `sections.tsx` para que
 * el hero del Business Case y el del Kickoff se compongan de las MISMAS piezas
 * (misma UX, un solo lugar donde arreglarlas). Los dos heros difieren solo en la
 * composición: el BC es left-aligned y sin eyebrow; el Kickoff es centrado, con
 * eyebrow y con stats derivados del cronograma.
 *
 * Piezas:
 *  - `CoverButton`      — sube la portada a `ctx.imageUploadUrl` → `data.coverImageUrl`.
 *  - `ClientLogoButton` — sube el logo a `ctx.clientLogoUploadUrl` → `Client.logoUrl`.
 *  - `BrandRow`         — fila `logo × [marca] × logo` editable y arrastrable.
 *  - `TagRow`           — chips arrastrables (⠿ / × / + Tag).
 *
 * `coverImageUrl` y `brands` viven FUERA del schema del agente (los cura el CSE y
 * sobreviven a las regeneraciones por carry-forward de keys no-schema).
 */
import { Fragment, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DayPicker } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { useToast } from "@/components/ui/Toast";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";
import { ScaleSlider } from "@/components/ui/ScaleSlider";
import { IconX } from "@/components/ui/AcceptReject";
import { usePopoverDismiss } from "@/components/ui/usePopoverDismiss";
import { LOGO_SCALE_MAX, LOGO_SCALE_MIN, LOGO_SCALE_STEP, logoScaleStyle, resolveLogoScale } from "@/lib/ui/logo-scale";
import type { LandingContext } from "./types";
import { SMARTEAM_LOGO_FONDO_OSCURO } from "@/lib/ui/smarteam-logo-oscuro";
import { subirDirecto } from "@/lib/storage/subir-directo";
import { fmtLocalDay } from "@/lib/timeline/weeks";
import {
  ANIO_MAXIMO,
  ANIO_MINIMO,
  esFechaDeProyecto,
  fechaLocalDeYmd,
  MENSAJE_FECHA_FUERA_DE_RANGO,
  ymdDeFechaLocal,
  type OrigenDelArranqueSugerido,
} from "@/lib/timeline/fecha-de-arranque";
import {
  datosParaLeer,
  idDeDatoNuevo,
  type DatoDeLaPortada,
  type DatoResuelto,
} from "@/lib/kickoff/datos-de-la-portada";

/** Píldora translúcida sobre el hero oscuro (Portada / Logo del cliente). */
const PILL: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
  background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff",
};

/** Botón "Portada" del hero (solo edición): sube una imagen a `uploadUrl` y la
 *  guarda en `data.coverImageUrl` (el motor la pinta como fondo full-bleed). */
export function CoverButton({
  coverImageUrl, uploadUrl, onSet,
}: { coverImageUrl?: string | null; uploadUrl: string; onSet: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const upload = async (file: File) => {
    setBusy(true);
    try {
      // Directo a Supabase: el VPS corta todo cuerpo de más de 1 MB (lib/storage/subida-directa.ts).
      const r = await subirDirecto<{ url?: string }>({ ruta: uploadUrl, archivo: file });
      if (r.ok && r.data.url) onSet(r.data.url);
      else toast.error(r.ok ? "No se pudo subir la imagen." : r.error);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      <button type="button" style={PILL} disabled={busy} onClick={() => inputRef.current?.click()}>
        🖼 {busy ? "Subiendo…" : coverImageUrl ? "Cambiar portada" : "Portada"}
      </button>
      {coverImageUrl && (
        <button type="button" style={{ ...PILL, background: "transparent" }} disabled={busy} onClick={() => onSet(null)}>
          <IconX className="w-3 h-3" />Quitar
        </button>
      )}
    </div>
  );
}

/** Botón "Logo del cliente" (solo edición): sube al endpoint del CLIENTE
 *  (`Client.logoUrl`) y avisa vía `onChanged` para refrescar el estado local. */
export function ClientLogoButton({
  hasLogo, uploadUrl, onChanged,
}: { hasLogo: boolean; uploadUrl: string; onChanged: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { logoUrl?: string; error?: string };
      if (res.ok && body.logoUrl) onChanged(body.logoUrl);
      else toast.error(body.error ?? "No se pudo subir el logo.");
    } catch {
      toast.error("No se pudo subir el logo (error de red).");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      <button type="button" style={PILL} disabled={busy} onClick={() => inputRef.current?.click()}>
        ⛭ {busy ? "Subiendo…" : hasLogo ? "Cambiar logo del cliente" : "Logo del cliente"}
      </button>
    </>
  );
}

/** Los dos botones de subida, juntos. No renderiza nada si el ctx no trae endpoints
 *  (modo lectura / vista del cliente). */
export function HeroUploadButtons({
  ctx, coverImageUrl, onCover,
}: { ctx: LandingContext; coverImageUrl?: string | null; onCover: (url: string | null) => void }) {
  if (!ctx.imageUploadUrl && !ctx.clientLogoUploadUrl) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {ctx.imageUploadUrl && (
        <CoverButton coverImageUrl={coverImageUrl} uploadUrl={ctx.imageUploadUrl} onSet={onCover} />
      )}
      {ctx.clientLogoUploadUrl && ctx.onClientLogoChange && (
        <div style={{ marginBottom: 18 }}>
          <ClientLogoButton hasLogo={!!ctx.clientLogoUrl} uploadUrl={ctx.clientLogoUploadUrl} onChanged={ctx.onClientLogoChange} />
        </div>
      )}
    </div>
  );
}

/**
 * Ajuste del tamaño del logo DESDE EL DOCUMENTO (solo edición).
 *
 * El logo se ve como el real y al clickearlo se abre un popover con la barra. El cierre
 * (clic afuera / Esc, con el `blur()` antes de desmontar que evita perder el valor) lo
 * aporta `usePopoverDismiss` — el mismo que usa el cronograma.
 *
 * Lo que se guarda es un OVERRIDE de este documento, que PISA a la base del cliente. Vive
 * en el `data` del hero (fuera del schema del agente, como `brands`), así que se persiste
 * por el `onChange` que ya existe: sin endpoint nuevo.
 */
function ClientLogoEditor({
  children, base, value, onPreview, onCommit,
}: {
  children: React.ReactNode;
  base: number;
  value: number | null;
  onPreview: (pct: number | null) => void;
  onCommit: (pct: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  usePopoverDismiss(open, useCallback(() => setOpen(false), []), wrapRef);

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Ajustar el tamaño del logo en este documento"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}
      >
        {children}
      </button>
      {open && (
        <div
          role="dialog"
          style={{
            position: "absolute", top: "calc(100% + 10px)", left: 0, zIndex: 30,
            width: 240, padding: 12, borderRadius: 12, background: "#fff",
            border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 12px 32px -8px rgba(5,24,73,0.28)",
            color: "#1f2937", textAlign: "left",
          }}
        >
          <ScaleSlider
            value={value}
            base={base}
            min={LOGO_SCALE_MIN}
            max={LOGO_SCALE_MAX}
            step={LOGO_SCALE_STEP}
            label="Tamaño en este documento"
            resetLabel="Usar el del cliente"
            onPreview={onPreview}
            onCommit={onCommit}
          />
          <p style={{ fontSize: 11, color: "#6b7280", margin: "8px 0 0" }}>
            {value === null
              ? `Sigue el tamaño del cliente (${base}%). Movelo para ajustarlo solo acá.`
              : `Solo en este documento. El del cliente es ${base}%.`}
          </p>
        </div>
      )}
    </span>
  );
}

/**
 * TOKENS CENTINELA de la fila de marcas. Ocupan una posición en el array `brands`
 * (por eso se pueden ARRASTRAR y quitar como cualquier otra marca) pero NO congelan
 * la imagen: se resuelven en cada render contra el ctx VIVO. Así el `@client` de un
 * snapshot publicado hace meses sigue mostrando el logo ACTUAL del cliente, y
 * renombrar la empresa no rompe nada (a diferencia de guardar su nombre como valor).
 */
export const BRAND_CLIENT = "@client";
export const BRAND_SMARTEAM = "@smarteam";
const isToken = (b: string) => b === BRAND_CLIENT || b === BRAND_SMARTEAM;

/**
 * `brands` persistido → lista a renderizar. Retrocompatible SIN migración de datos, y
 * reproduciendo EXACTAMENTE el orden del motor anterior en los casos ya publicados
 * (Business Cases y kickoffs que el cliente ya vio):
 *
 *  - con algún token (formato nuevo) → literal; respeta que el CSE haya reordenado.
 *  - vacío (la mayoría) → la semilla del motor viejo: los logos que EXISTEN iban primero,
 *    y lo que no tenía logo caía como texto DESPUÉS. Por eso, sin logo de cliente pero con
 *    logo de Smarteam, el orden publicado es `Smarteam × nombre-del-cliente × HubSpot`, no
 *    al revés. Invertirlo cambiaría landings y PDFs ya emitidos.
 *  - sin token y no vacío (el CSE curó la fila) → el motor viejo anteponía SOLO los logos
 *    que existían y dejaba el resto tal cual. Se replica: se antepone un token únicamente
 *    cuando su logo está cargado, y se descarta el texto que ese logo ya estaba mostrando
 *    (si no hay logo, el texto se conserva — es la única forma de ver esa marca).
 */
function normalizeBrands(raw: string[] | undefined, ctx: LandingContext): string[] {
  const list = (raw ?? []).filter((b): b is string => typeof b === "string");
  if (list.some(isToken)) return list;

  const hasClientLogo = !!ctx.clientLogoUrl;
  const hasSmarteamLogo = !!ctx.smarteamLogoUrl;

  if (list.length === 0) {
    return !hasClientLogo && hasSmarteamLogo
      ? [BRAND_SMARTEAM, BRAND_CLIENT, "HubSpot"]
      : [BRAND_CLIENT, BRAND_SMARTEAM, "HubSpot"];
  }

  const covered = new Set(
    [
      ...(hasSmarteamLogo ? ["smarteam"] : []),
      ...(hasClientLogo ? [(ctx.clientName || "").trim().toLowerCase()] : []),
    ].filter(Boolean),
  );
  const head = [
    ...(hasClientLogo ? [BRAND_CLIENT] : []),
    ...(hasSmarteamLogo ? [BRAND_SMARTEAM] : []),
  ];
  return [...head, ...list.filter((b) => !covered.has(b.trim().toLowerCase()))];
}

/**
 * Fila de marcas `logo-cliente × Smarteam × [Marca] × …` — editable y arrastrable.
 * TODOS los ítems (incluidos los dos logos, vía tokens) viven dentro del `SortableItems`.
 * Una brand de texto cuyo nombre matchee `ctx.brandLogos` (p.ej. "hubspot") se pinta
 * como imagen. Un token sin logo cargado cae a un badge de texto.
 */
export function BrandRow({
  brands: raw, ctx, editable, onChange, logoScale, onLogoScale,
}: {
  brands?: string[];
  ctx: LandingContext;
  editable?: boolean;
  onChange: (next: string[]) => void;
  /** Ajuste de tamaño de ESTE documento. Pisa a la base del cliente (`ctx.clientLogoScale`);
   *  ausente = se usa la base. Ver lib/ui/logo-scale.ts. */
  logoScale?: number | null;
  /** Guarda el ajuste de ESTE documento. `null` = borrarlo y volver a la base del cliente. */
  onLogoScale?: (pct: number | null) => void;
}) {
  // Lo que se está arrastrando AHORA (solo pinta; el guardado va al soltar). Separado del
  // valor persistido para no mandar una escritura por píxel del arrastre.
  const [previewScale, setPreviewScale] = useState<number | null>(null);
  const all = normalizeBrands(raw, ctx);
  // En LECTURA se descartan las marcas sin nombre: "+ Marca" agrega una vacía y el CSE puede
  // publicar sin completarla; al cliente le quedaría un separador × colgando y una píldora vacía.
  // En edición se conservan (son justamente las que el CSE está por escribir).
  const brands = editable ? all : all.filter((b) => isToken(b) || b.trim());
  return (
    // Sin `key` de remonte: antes el array se re-derivaba y cambiaba de largo DESDE LA
    // CABEZA al aparecer un logo, desalineando los ids posicionales de SortableItems.
    // Con los tokens, subir un logo solo cambia la RESOLUCIÓN del ítem, no el array.
    <SortableItems items={brands} disabled={!editable}
      onReorder={onChange}
      itemStyle={{ display: "inline-flex", alignItems: "center", gap: 12 }}
      container={(nodes) => (
        <div className="stl-brandrow">
          {nodes}
          {editable && <AddBtn label="Marca" onClick={() => onChange(appendItem(brands, ""))} />}
        </div>
      )}>
      {(b, i, handle) => {
        const sep = i > 0 ? <span className="stl-brand-x">×</span> : null;
        const token = isToken(b);
        const esCliente = b === BRAND_CLIENT;
        /* El hero SIEMPRE va sobre navy (los 7 defs con `backdrop:true` son `theme:"dark"`,
           congelado por lib/ui/landing-hero-theme.test.ts), así que acá se puede elegir la
           versión para fondo oscuro sin preguntarle el tema a nadie. */
        /* Smarteam —el token o una marca de texto que se llame así— usa SIEMPRE su versión
           blanca oficial, sin filtro: aplastado a blanco, el isotipo pierde los círculos y
           quedan dos barras (ver lib/ui/smarteam-logo-oscuro.ts). Solo si hay logo cargado,
           para no cambiar qué marcas aparecen en la fila. */
        const esSmarteam = token ? !esCliente : b.trim().toLowerCase() === "smarteam";
        const smarteamOscuro = esSmarteam && !!(ctx.smarteamLogoUrl || ctx.brandLogos?.smarteam);
        const usaVersionOscura = (esCliente && !!ctx.clientLogoDarkUrl) || smarteamOscuro;
        const logo = smarteamOscuro
          ? SMARTEAM_LOGO_FONDO_OSCURO
          : token
            ? (esCliente ? (ctx.clientLogoDarkUrl ?? ctx.clientLogoUrl) : ctx.smarteamLogoUrl)
            : ctx.brandLogos?.[b.trim().toLowerCase()];
        const alt = token ? (esCliente ? ctx.clientName || "Cliente" : "Smarteam") : b;
        /* El tamaño se aplica SOLO al logo del cliente. Los tres logos de la fila comparten
           la clase `.stl-brand-logo`; los otros dos no traen la variable y caen al fallback
           `1` del `calc`, así que quedan clavados en su alto de siempre. */
        const pctCliente = resolveLogoScale(ctx.clientLogoScale, previewScale ?? logoScale);
        const escala = esCliente ? logoScaleStyle(pctCliente) : undefined;
        /* Con versión oscura real el archivo ya está pensado para este fondo: se muestra tal
           cual. Sin ella queda el filtro que lo aplasta a blanco — que es lo único que hoy
           hace visibles los logos de los clientes que solo subieron un archivo. */
        const claseLogo = `stl-brand-logo${usaVersionOscura ? " stl-brand-logo--asis" : ""}`;
        // Los tokens se ARRASTRAN pero no se QUITAN (paridad con el comportamiento previo,
        // donde los logos ni siquiera eran ítems). Permitir quitarlos dejaría un array sin
        // tokens, indistinguible de uno legacy → `normalizeBrands` los reinsertaría solo.
        const removable = editable && !token;
        return (
          <Fragment>
            {sep}
            {logo ? (
              <span className="stl-item stl-brand-logo-wrap" style={{ display: "inline-flex", alignItems: "center" }}>
                {handle}
                {removable && <RemoveBtn onClick={() => onChange(removeAt(brands, i))} />}
                {esCliente && editable && onLogoScale ? (
                  <ClientLogoEditor
                    base={resolveLogoScale(ctx.clientLogoScale)}
                    value={logoScale ?? null}
                    onPreview={setPreviewScale}
                    onCommit={(pct) => { setPreviewScale(null); onLogoScale(pct); }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={claseLogo} src={logo} alt={alt} style={escala} />
                  </ClientLogoEditor>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className={claseLogo} src={logo} alt={alt} style={escala} />
                )}
              </span>
            ) : (
              <span className="stl-item stl-brand-badge">
                {handle}
                {removable && <RemoveBtn onClick={() => onChange(removeAt(brands, i))} />}
                {/* Un token sin logo cargado muestra su nombre, pero NO es texto editable
                    (editarlo lo volvería una marca suelta y perdería el vínculo con el ctx). */}
                {token ? (
                  <span>{alt}</span>
                ) : (
                  <Editable as="span" editable={editable} value={b} placeholder="Marca / plataforma…"
                    onCommit={(v) => onChange(replaceAt(brands, i, v))} />
                )}
              </span>
            )}
          </Fragment>
        );
      }}
    </SortableItems>
  );
}

/** Chips del hero: arrastrables (⠿), con `×` para quitar y `+ Tag` para agregar. */
export function TagRow({
  tags, editable, onChange, placeholder = "Hub / integración / diferenciador…",
}: { tags: string[]; editable?: boolean; onChange: (next: string[]) => void; placeholder?: string }) {
  if (tags.length === 0 && !editable) return null;
  return (
    <SortableItems items={tags} disabled={!editable} onReorder={onChange}
      container={(nodes) => (
        <div className="stl-tags">
          {nodes}
          {editable && <AddBtn label="Tag" onClick={() => onChange(appendItem(tags, ""))} />}
        </div>
      )}>
      {(tag, i, handle) => (
        <span className="stl-item stl-tag">
          {handle}
          {editable && <RemoveBtn onClick={() => onChange(removeAt(tags, i))} />}
          <Editable as="span" editable={editable} value={tag} placeholder={placeholder}
            onCommit={(v) => onChange(replaceAt(tags, i, v))} />
        </span>
      )}
    </SortableItems>
  );
}

/**
 * Un número de la portada (duración, arranque, cantidad de fases).
 *
 * Vivía dentro de `KickoffSections`, pero la portada del documento CRONOGRAMA muestra los
 * MISMOS tres números derivados del mismo cronograma — y dos copias del mismo bloque es la
 * forma más segura de que dentro de un año se vean distinto. Usa los tokens `--dark-*`:
 * asume una portada de fondo oscuro, que es lo que declaran las dos defs.
 */
export function HeroStat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="font-display" style={{ color: "var(--dark-text)", fontSize: 28, lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 14, color: "var(--dark-text-secondary)", marginLeft: 6 }}>{unit}</span>}
      </div>
      <div className="eyebrow" style={{ color: "var(--dark-text-muted)", marginTop: 7, fontSize: 11 }}>{label}</div>
    </div>
  );
}

/**
 * La FECHA de arranque en la portada, editable: escribe el ancla del cronograma (una sola fecha
 * para kickoff, cronograma y enlace del cliente), no un texto encima. `valor` en AAAA-MM-DD.
 *
 * ⛔ Un CALENDARIO, no un `<input type="date">` (2026-10-20). El campo nativo guardaba en cada
 * cambio, y escribir «2026» en el año pasa por «0002», «0020», «0202»: cada tecla viajaba como una
 * fecha válida (Cemaco, Spectrum y Cayalá quedaron con el arranque en el año 2 o 26, y con eso todas
 * sus tareas vencidas). Con un clic en un día no hay año a medio escribir. Además el campo se
 * encimaba debajo del número y descuadraba la fila: el calendario flota y no mueve nada.
 *
 * Sin fecha, el calendario abre en la SUGERIDA (la reunión de kickoff, o hoy) y la ofrece con un
 * botón. Solo la ofrece: el ancla se escribe con el clic (docs/KNOWN-ERRORS.md).
 */
export function HeroStatFecha({
  valor,
  etiqueta,
  sugerida,
  onCambiar,
}: {
  valor: string | null;
  /** Cómo se lee la fecha («21 sep 2026»), o «Por definir». */
  etiqueta: string;
  /** La fecha que se propone cuando no hay arranque (ver `arranqueSugerido`). */
  sugerida?: { ymd: string; origen: OrigenDelArranqueSugerido } | null;
  onCambiar: (ymd: string | null) => Promise<void>;
}) {
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const calendarioRef = useRef<HTMLSpanElement>(null);
  usePopoverDismiss(abierto, useCallback(() => setAbierto(false), []), ref);

  /* Centrado bajo la fecha, salvo que se salga de la pantalla (en un teléfono, el dato de la derecha
     dejaba medio calendario afuera): ahí se corre lo justo para quedar a 16px del borde. */
  useLayoutEffect(() => {
    const el = calendarioRef.current;
    if (!abierto || !el) return;
    el.style.transform = "translateX(-50%)";
    const r = el.getBoundingClientRect();
    const margen = 16;
    const corrimiento =
      r.right > window.innerWidth - margen ? window.innerWidth - margen - r.right : r.left < margen ? margen - r.left : 0;
    if (corrimiento) el.style.transform = `translateX(calc(-50% + ${Math.round(corrimiento)}px))`;
  }, [abierto]);

  const elegida = valor ? fechaLocalDeYmd(valor) : undefined;
  const propuesta = !valor && sugerida ? fechaLocalDeYmd(sugerida.ymd) : undefined;

  const elegir = async (ymd: string | null) => {
    setAbierto(false);
    if (ymd !== null && !esFechaDeProyecto(ymd)) {
      toast.error(MENSAJE_FECHA_FUERA_DE_RANGO);
      return;
    }
    setGuardando(true);
    try {
      await onCambiar(ymd);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar la fecha de arranque.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <span ref={ref} className="stl-dato-fecha">
      <button
        type="button"
        className="stl-dato-fecha-btn"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={`Fecha de arranque del proyecto: ${etiqueta}. Cambiarla`}
        title="Cambia la fecha de arranque del cronograma"
        disabled={guardando}
        onClick={() => setAbierto((a) => !a)}
      >
        {guardando ? "Guardando…" : etiqueta}
      </button>
      {abierto && (
        <span ref={calendarioRef} className="stl-dato-calendario" role="dialog" aria-label="Elige la fecha de arranque">
          {propuesta && sugerida && (
            <button type="button" className="stl-dato-calendario-sugerida" onClick={() => void elegir(sugerida.ymd)}>
              Usar el {fmtLocalDay(propuesta)}
              <span>{sugerida.origen === "kickoff" ? "la reunión de kickoff" : "hoy"}</span>
            </button>
          )}
          <DayPicker
            mode="single"
            selected={elegida}
            defaultMonth={elegida ?? propuesta ?? new Date()}
            startMonth={new Date(ANIO_MINIMO, 0)}
            endMonth={new Date(ANIO_MAXIMO, 11)}
            onSelect={(d) => {
              if (d) void elegir(ymdDeFechaLocal(d));
            }}
            locale={es}
            showOutsideDays
          />
          <span className="stl-dato-calendario-pie">
            {valor ? (
              <button type="button" onClick={() => void elegir(null)}>
                Quitar la fecha
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => void elegir(ymdDeFechaLocal(new Date()))}>
              Hoy
            </button>
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * La FILA DE DATOS CLAVE de la portada («8 semanas · 26 oct 2026 · 5 fases»), editable como las
 * etiquetas: ⠿ para moverlos, × para quitar uno, texto y rótulo editables en el lugar, y «+ Dato» al
 * final de la misma fila. La lógica (qué sale del cronograma, qué gana) vive en
 * `lib/kickoff/datos-de-la-portada.ts`; esto solo pinta.
 *
 * Mismo aspecto al editar y al presentar: número grande + rótulo chico, en las mismas medidas. Los
 * controles de edición flotan en las esquinas (solo al pasar el mouse) y el calendario es un
 * popover: nada empuja la fila.
 */
export function FilaDeDatos({
  datos,
  resueltos,
  editable,
  onChange,
  fecha,
}: {
  datos: DatoDeLaPortada[];
  /** `resolverDatos(datos, …)`, en el mismo orden. */
  resueltos: DatoResuelto[];
  editable?: boolean;
  onChange: (next: DatoDeLaPortada[]) => void;
  /** El control del dato de arranque al editar (el calendario). Sin él, se escribe como texto. */
  fecha?: (r: DatoResuelto) => ReactNode;
}) {
  if (!editable) {
    const visibles = datosParaLeer(resueltos);
    if (visibles.length === 0) return null;
    return (
      <div className="stl-datos">
        {visibles.map((r) => (
          <HeroStat key={r.id} value={r.valor} unit={r.unidad} label={r.etiqueta} />
        ))}
      </div>
    );
  }

  const cambiar = (i: number, patch: Partial<DatoDeLaPortada>) => onChange(replaceAt(datos, i, { ...datos[i], ...patch }));
  const agregar = () =>
    onChange(appendItem(datos, { id: idDeDatoNuevo(datos, () => Math.random().toString(36).slice(2, 8)), valor: "", etiqueta: "" }));

  return (
    <SortableItems
      items={datos}
      onReorder={onChange}
      container={(nodes) => (
        <div className="stl-datos">
          {nodes}
          <AddBtn label="Dato" onClick={agregar} />
        </div>
      )}
    >
      {(d, i, handle) => {
        const r = resueltos[i];
        return (
          <div className="stl-item stl-dato">
            {handle}
            <RemoveBtn title="Quitar este dato" onClick={() => onChange(removeAt(datos, i))} />
            <div className="stl-dato-valor font-display">
              {/* El arranque es SIEMPRE el calendario: muestra el texto escrito, si hay, y elegir un día
                  lo reemplaza por la fecha real. */}
              {d.fuente === "arranque" && fecha ? (
                fecha(r)
              ) : (
                <>
                  <Editable
                    as="span"
                    editable
                    value={r?.valor ?? ""}
                    placeholder={d.fuente ? "Del cronograma" : "3 integraciones"}
                    onCommit={(v) => {
                      // Lo que ya salía del cronograma no se guarda como texto: así sigue vivo.
                      const igualAlDerivado = !!r?.derivado && v.trim() === r.valor;
                      cambiar(i, { valor: igualAlDerivado ? "" : v });
                    }}
                  />
                  {r?.derivado && r.unidad && <span className="stl-dato-unidad">{r.unidad}</span>}
                </>
              )}
            </div>
            <Editable
              as="div"
              className="eyebrow stl-dato-etiqueta"
              editable
              value={r?.etiqueta ?? ""}
              placeholder="Etiqueta"
              onCommit={(v) => cambiar(i, { etiqueta: v })}
            />
          </div>
        );
      }}
    </SortableItems>
  );
}
