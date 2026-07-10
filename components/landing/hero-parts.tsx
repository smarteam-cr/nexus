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
import { Fragment, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";
import type { LandingContext } from "./types";

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
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && body.url) onSet(body.url);
      else toast.error(body.error ?? "No se pudo subir la imagen.");
    } catch {
      toast.error("No se pudo subir la imagen (error de red).");
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
          ✕ Quitar
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
  brands: raw, ctx, editable, onChange,
}: { brands?: string[]; ctx: LandingContext; editable?: boolean; onChange: (next: string[]) => void }) {
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
        const logo = token
          ? (b === BRAND_CLIENT ? ctx.clientLogoUrl : ctx.smarteamLogoUrl)
          : ctx.brandLogos?.[b.trim().toLowerCase()];
        const alt = token ? (b === BRAND_CLIENT ? ctx.clientName || "Cliente" : "Smarteam") : b;
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="stl-brand-logo" src={logo} alt={alt} />
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
