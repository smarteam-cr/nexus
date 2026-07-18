"use client";

/**
 * components/cobranza/CostoForm.tsx — crear/editar un costo recurrente de
 * REFERENCIA (fase 4, solo SUPER_ADMIN). Cifras estimadas para dirección:
 * el "factor de cargas" es un multiplicador que escribe la persona — Nexus
 * NO calcula cargas ni trae defaults fiscales. Se guarda SIEMPRE `monto`
 * (all-in canónico); montoBase+factorCargas viajan SOLO en modo base+factor.
 * Solo SALARIO liga persona (picker LAZY de /api/team) — cross-field lo
 * re-valida el server (costoCreateSchema / costoPatchSchema sobre la fila
 * mergeada) y su mensaje se muestra acá mismo.
 */
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { CostoRecurrenteDTO } from "@/lib/cobranza";
import {
  COSTOS_CATEGORIAS,
  COSTOS_FRECUENCIAS,
  CATEGORIA_COSTO_LABEL,
  FRECUENCIA_COSTO_LABEL,
} from "@/lib/cobranza/schema";
import { fmtMonto, INPUT_CLS, SELECT_CLS, LABEL_CLS } from "./format";

interface TeamMemberOption {
  id: string;
  name: string;
  email: string;
  deactivatedAt: string | null;
}

type ModoMonto = "ALL_IN" | "BASE_FACTOR";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function CostoForm({
  costo,
  onClose,
  onSaved,
}: {
  /** null = crear; con valor = editar. */
  costo: CostoRecurrenteDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editaBaseFactor = costo != null && costo.montoBase != null && costo.factorCargas != null;

  const [categoria, setCategoria] = useState(costo?.categoria ?? "SALARIO");
  const [nombre, setNombre] = useState(costo?.nombre ?? "");
  const [moneda, setMoneda] = useState(costo?.moneda ?? "CRC");
  const [frecuencia, setFrecuencia] = useState(costo?.frecuencia ?? "MENSUAL");
  const [activo, setActivo] = useState(costo?.activo ?? true);
  const [notas, setNotas] = useState(costo?.notas ?? "");
  const [teamMemberId, setTeamMemberId] = useState(costo?.teamMemberId ?? "");

  // Al editar un costo que trae base+factor, se abre en ese modo con sus valores.
  const [modo, setModo] = useState<ModoMonto>(editaBaseFactor ? "BASE_FACTOR" : "ALL_IN");
  const [monto, setMonto] = useState(costo ? String(costo.monto) : "");
  const [base, setBase] = useState(costo?.montoBase != null ? String(costo.montoBase) : "");
  const [factor, setFactor] = useState(costo?.factorCargas != null ? String(costo.factorCargas) : "");

  // Picker de personas — LAZY: solo se fetchea si la categoría es SALARIO.
  const [members, setMembers] = useState<TeamMemberOption[] | null>(null);
  const [errorMembers, setErrorMembers] = useState(false);

  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const esSalario = categoria === "SALARIO";
  const esBaseFactor = esSalario && modo === "BASE_FACTOR";

  // "Cargando" es estado DERIVADO (sin lista y sin error, con el fetch en vuelo)
  // — un setState síncrono dentro del effect dispara renders en cascada (lint).
  const cargandoMembers = esSalario && members === null && !errorMembers;

  useEffect(() => {
    if (!esSalario || members !== null || errorMembers) return;
    let cancelado = false;
    fetchJson<{ members: TeamMemberOption[] }>("/api/team")
      .then((d) => {
        if (!cancelado) setMembers(d.members.filter((m) => m.deactivatedAt === null));
      })
      .catch(() => {
        if (!cancelado) setErrorMembers(true);
      });
    return () => {
      cancelado = true;
    };
  }, [esSalario, members, errorMembers]);

  // La persona del costo puede estar desactivada (fuera del listado filtrado):
  // se agrega como opción para no des-vincularla en silencio al guardar.
  const miembroActualFaltante =
    costo?.teamMemberId && members !== null && !members.some((m) => m.id === costo.teamMemberId)
      ? { id: costo.teamMemberId, name: costo.teamMemberName ?? "Persona desactivada" }
      : null;

  function cambiarCategoria(next: string) {
    setCategoria(next);
    if (next !== "SALARIO") {
      // El server igual los fuerza a null — se limpian acá para que el form no mienta.
      setTeamMemberId("");
      setBase("");
      setFactor("");
      setModo("ALL_IN");
    }
  }

  const montoNum = Number(monto);
  const baseNum = round2(Number(base));
  const factorNum = Number(factor);
  // Preview vivo del all-in que se va a guardar en modo base+factor.
  const montoCalculado =
    esBaseFactor && baseNum > 0 && factorNum > 0 && Number.isFinite(factorNum)
      ? round2(baseNum * factorNum)
      : null;

  const montoValido = esBaseFactor
    ? montoCalculado != null
    : Number.isFinite(montoNum) && montoNum > 0;
  const puedeGuardar = nombre.trim().length > 0 && montoValido && !saving;

  async function submit() {
    if (!puedeGuardar) return;
    setSaving(true);
    setServerError(null);
    const body = {
      categoria,
      nombre: nombre.trim(),
      // El ALL-IN canónico SIEMPRE viaja (directo o ya calculado base×factor).
      monto: esBaseFactor ? montoCalculado : round2(montoNum),
      moneda,
      frecuencia,
      teamMemberId: esSalario && teamMemberId ? teamMemberId : null,
      montoBase: esBaseFactor ? baseNum : null,
      factorCargas: esBaseFactor ? factorNum : null,
      activo,
      notas: notas.trim() ? notas.trim() : null,
    };
    try {
      if (costo) {
        await fetchJson(`/api/cobranza/costos/${costo.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetchJson("/api/cobranza/costos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (e) {
      setServerError(
        e instanceof ApiError ? e.message : "No se pudo guardar el costo. Probá de nuevo.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[10vh]">
      <div className="absolute inset-0 bg-black/30" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl p-4 space-y-3"
      >
        <div>
          <h3 className="text-sm font-semibold text-fg">
            {costo ? "Editar costo" : "Agregar costo"}
          </h3>
          <p className="text-xs text-fg-secondary mt-0.5">
            Cifra estimada de referencia para dirección — no es contabilidad.
          </p>
        </div>

        <div>
          <label className={LABEL_CLS}>Categoría</label>
          <select
            value={categoria}
            onChange={(e) => cambiarCategoria(e.target.value)}
            className={SELECT_CLS}
          >
            {COSTOS_CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_COSTO_LABEL[c] ?? c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLS}>Nombre</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={esSalario ? "Ej. Salario CSE senior" : "Ej. HubSpot Sales Pro"}
            maxLength={120}
            className={INPUT_CLS}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>Moneda</label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={SELECT_CLS}>
              <option value="CRC">CRC (₡)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Frecuencia</label>
            <select
              value={frecuencia}
              onChange={(e) => setFrecuencia(e.target.value)}
              className={SELECT_CLS}
            >
              {COSTOS_FRECUENCIAS.map((f) => (
                <option key={f} value={f}>
                  {FRECUENCIA_COSTO_LABEL[f] ?? f}
                </option>
              ))}
            </select>
          </div>
        </div>

        {esSalario && (
          <>
            <div>
              <label className={LABEL_CLS}>Persona del equipo</label>
              {cargandoMembers ? (
                // Skeleton estructural: reserva la altura del select mientras llega /api/team.
                <div className="space-y-2 py-1">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" delay={60} />
                  <Skeleton className="h-8" delay={120} />
                </div>
              ) : errorMembers ? (
                <div className="flex items-center gap-2 py-1">
                  <p className="text-xs text-red-600">No se pudo cargar el equipo.</p>
                  <button
                    type="button"
                    onClick={() => setErrorMembers(false)}
                    className="text-[11px] font-medium text-brand hover:underline"
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                <select
                  value={teamMemberId}
                  onChange={(e) => setTeamMemberId(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="">Sin vincular</option>
                  {miembroActualFaltante && (
                    <option value={miembroActualFaltante.id}>
                      {miembroActualFaltante.name} (desactivada)
                    </option>
                  )}
                  {(members ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[11px] text-fg-muted mt-1">
                Vinculá la persona si ya existe — un salario puede quedar sin vincular
                (contratación en curso).
              </p>
            </div>

            <div>
              <label className={LABEL_CLS}>¿Cómo capturás el monto?</label>
              <div className="flex gap-2">
                {(
                  [
                    ["ALL_IN", "Monto all-in"],
                    ["BASE_FACTOR", "Base + factor"],
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setModo(k)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                      modo === k
                        ? "border-brand/30 text-brand bg-brand/10"
                        : "border-line text-fg-secondary hover:bg-surface-hover"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {esBaseFactor ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Monto base</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                  placeholder="0.00"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Factor de cargas</label>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={factor}
                  onChange={(e) => setFactor(e.target.value)}
                  placeholder="ej. 1.35"
                  className={INPUT_CLS}
                />
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
              <p className="text-xs text-fg">
                Se guarda:{" "}
                <span className="font-semibold tabular-nums">
                  {montoCalculado != null ? fmtMonto(montoCalculado, moneda) : "—"}
                </span>
              </p>
              <p className="text-[11px] text-fg-muted mt-0.5">
                El factor es un multiplicador tuyo — Nexus no calcula cargas.
              </p>
            </div>
          </>
        ) : (
          <div>
            <label className={LABEL_CLS}>{esSalario ? "Monto all-in" : "Monto"}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              className={INPUT_CLS}
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="accent-current"
          />
          Activo (cuenta para el burn mensual)
        </label>

        <div>
          <label className={LABEL_CLS}>Notas (opcional)</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Contexto del costo…"
            className={`${INPUT_CLS} resize-y`}
          />
        </div>

        {serverError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-600">
            {serverError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-fg-muted hover:text-fg px-2 py-1.5"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!puedeGuardar}
            onClick={submit}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Guardando…" : costo ? "Guardar cambios" : "Agregar costo"}
          </button>
        </div>
      </div>
    </div>
  );
}
