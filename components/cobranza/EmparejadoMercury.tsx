"use client";

/**
 * components/cobranza/EmparejadoMercury.tsx
 *
 * Qué cuenta de Nexus es cada cliente de Mercury. Es el mismo trabajo que «Emparejar» de Odoo, desde el lado de
 * Mercury: allá se parte de la cuenta, acá del cliente, porque Mercury tiene pocos clientes (unos treinta) y cada uno
 * trae sus facturas.
 *
 * ── LAS PROPUESTAS DICEN POR QUÉ ────────────────────────────────────────────────
 * Cada propuesta viene con su evidencia (`proponerCuentas`, lib/cobranza/mercury/emparejado.ts): un cobro de esa cuenta
 * ya nombra una factura de este cliente, el nombre es el mismo, o los montos coinciden. La de monto es la más débil y
 * solo se ofrece entre cuentas que facturan por Mercury: dos clientes pueden pagar lo mismo.
 *
 * ── QUÉ CAMBIA AL EMPAREJAR ─────────────────────────────────────────────────────
 * El cliente queda en la cuenta, con firma, y su nombre pasa a ser una sociedad de Mercury de la cuenta (la que eligen
 * los cobros al marcarse facturados). Desde ahí «Lo que no cuadra» compara sus facturas con los cobros de esa cuenta.
 * ⛔ No toca ningún cobro ni escribe en Mercury.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyState, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { textoDeMontos, type MontoEnMoneda } from "@/lib/cobranza/odoo/diferencias";
import { fmtFecha } from "./format";

type Via = "NUMERO" | "NOMBRE" | "MONTO" | "MANUAL";

interface Propuesta {
  cuentaId: string;
  cuentaNombre: string;
  via: Exclude<Via, "MANUAL">;
  evidencia: string;
}
interface Cliente {
  mercuryCustomerId: string;
  nombre: string;
  pais: string | null;
  cuentaId: string | null;
  cuentaNombre: string | null;
  via: Via | null;
  ignorado: boolean;
  confirmadoPor: string | null;
  confirmadoEn: string | null;
  desaparecido: boolean;
  facturas: number;
  ultimaFactura: string | null;
  porCobrar: MontoEnMoneda[];
  propuestas: Propuesta[];
}
interface Cuenta {
  cuentaId: string;
  nombre: string;
  via: string;
}
interface Estado {
  clientes: Cliente[];
  cuentas: Cuenta[];
  cuentasSinCliente: Array<{ cuentaId: string; nombre: string }>;
  conteos: { clientes: number; emparejados: number; sinEmparejar: number; ignorados: number; cuentasSinCliente: number };
}

const VIA_LABEL: Record<Via, string> = { NUMERO: "por número", NOMBRE: "por nombre", MONTO: "por monto", MANUAL: "a mano" };
const FUERZA: Record<Propuesta["via"], string> = {
  NUMERO: "text-success-ink bg-success-surface border-success-line",
  NOMBRE: "text-brand bg-brand/10 border-brand/30",
  MONTO: "text-warn-ink bg-warn-surface border-warn-line",
};
const TIP_ES_ESTA = "Empareja este cliente de Mercury con esta cuenta: sus facturas pasan a ella. Se deshace con «Desvincular».";

/** Lo que el cliente tiene en Mercury, en una frase. */
function loQueTiene(c: Cliente): string {
  if (c.facturas === 0) return "Sin facturas en Mercury";
  const n = c.facturas === 1 ? "1 factura" : `${c.facturas} facturas`;
  const ultima = c.ultimaFactura ? ` · la última, del ${fmtFecha(c.ultimaFactura)}` : "";
  return c.porCobrar.length ? `${n} · por cobrar ${textoDeMontos(c.porCobrar)}${ultima}` : `${n}, todas pagadas o anuladas${ultima}`;
}

export default function EmparejadoMercury({
  recarga = 0,
  onConteos,
  onCambio,
}: {
  /** Sube con «Actualizar desde Mercury»: la lista se vuelve a leer sin desmontarse. */
  recarga?: number;
  /** Los clientes por emparejar, para el número de la pestaña. */
  onConteos?: (porEmparejar: number, cuentasSinCliente: number) => void;
  /** Emparejar mueve «Lo que no cuadra»: se le avisa a la página para que lo recuente. */
  onCambio?: () => void;
}) {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [verEmparejados, setVerEmparejados] = useState(false);
  const [verNoClientes, setVerNoClientes] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchJson<Estado>("/api/cobranza/mercury/emparejado");
      setEstado(r);
      onConteos?.(r.conteos.sinEmparejar, r.conteos.cuentasSinCliente);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el emparejado.");
    } finally {
      setCargando(false);
    }
  }, [toast, onConteos]);

  useEffect(() => {
    void cargar();
  }, [cargar, recarga]);

  const accion = useCallback(
    async (body: Record<string, unknown>, clave: string, listo: string) => {
      setOcupado(clave);
      try {
        await fetchJson("/api/cobranza/mercury/emparejado", { method: "POST", body: JSON.stringify(body) });
        toast.success(listo);
        setEligiendo(null);
        await cargar();
        onCambio?.();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
      } finally {
        setOcupado(null);
      }
    },
    [cargar, onCambio, toast],
  );

  const emparejar = (c: Cliente, cuentaId: string, cuentaNombre: string, via: Via) =>
    accion(
      { accion: "confirmar", mercuryCustomerId: c.mercuryCustomerId, cuentaId, via },
      c.mercuryCustomerId,
      `${c.nombre} quedó en ${cuentaNombre}.`,
    );

  /* Primero los que tienen propuesta (son un clic), después los que deben plata, después los de factura más reciente. */
  const porEmparejar = useMemo(
    () =>
      (estado?.clientes ?? [])
        .filter((c) => !c.cuentaId && !c.ignorado)
        .sort(
          (a, b) =>
            Number(b.propuestas.length > 0) - Number(a.propuestas.length > 0) ||
            Number(b.porCobrar.length > 0) - Number(a.porCobrar.length > 0) ||
            (b.ultimaFactura ?? "").localeCompare(a.ultimaFactura ?? ""),
        ),
    [estado],
  );
  const emparejados = useMemo(
    () => (estado?.clientes ?? []).filter((c) => c.cuentaId).sort((a, b) => (a.cuentaNombre ?? "").localeCompare(b.cuentaNombre ?? "", "es")),
    [estado],
  );
  const ignorados = useMemo(() => (estado?.clientes ?? []).filter((c) => c.ignorado && !c.cuentaId), [estado]);

  if (cargando && !estado) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-fg-muted">
        <Spinner /> Cargando los clientes de Mercury…
      </div>
    );
  }
  if (!estado) return null;
  if (estado.clientes.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay clientes de Mercury"
        description="Aprieta «Actualizar desde Mercury», arriba, para traer los clientes y sus facturas."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-fg">
        {porEmparejar.length === 0 ? (
          "Todos los clientes de Mercury tienen su cuenta en Nexus, o están marcados como no clientes."
        ) : (
          <>
            <strong className="text-lg tabular-nums">{porEmparejar.length}</strong>{" "}
            {porEmparejar.length === 1 ? "cliente de Mercury sin cuenta" : "clientes de Mercury sin cuenta"} en Nexus. Sus
            facturas no cuentan en la cobranza hasta emparejarlos.
          </>
        )}
        <p className="mt-0.5 text-xs text-fg-muted">
          {estado.conteos.emparejados} de {estado.conteos.clientes} clientes de Mercury ya tienen cuenta. Mercury usa la razón
          social; Nexus, el nombre comercial: por eso hay que decírselo una vez.
        </p>
      </div>

      {porEmparejar.length > 0 && (
        <div className="space-y-2">
          {porEmparejar.map((c) => (
            <div key={c.mercuryCustomerId} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg" title={c.nombre}>
                    {c.nombre}
                    {c.pais && <span className="font-normal text-fg-muted"> · {c.pais}</span>}
                  </div>
                  <div className={`text-xs ${c.porCobrar.length ? "text-fg-secondary" : "text-fg-muted"}`}>{loQueTiene(c)}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={ocupado !== null}
                  onClick={() => setEligiendo(eligiendo === c.mercuryCustomerId ? null : c.mercuryCustomerId)}
                  title="Elige a mano la cuenta de Nexus de este cliente."
                >
                  {eligiendo === c.mercuryCustomerId ? "Cerrar" : c.propuestas.length ? "Es otra cuenta" : "Es de una cuenta de Nexus"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={ocupado !== null}
                  onClick={() =>
                    accion(
                      { accion: "ignorar", mercuryCustomerId: c.mercuryCustomerId, ignorado: true },
                      c.mercuryCustomerId,
                      `${c.nombre} sale de la lista. Se devuelve en «Marcados como no clientes».`,
                    )
                  }
                  title="Deja de aparecer acá y en «Lo que no cuadra». No borra nada."
                >
                  No es cliente nuestro
                </Button>
              </div>

              {c.propuestas.map((p) => (
                <div key={p.cuentaId} className="mt-2 flex flex-wrap items-start gap-3 rounded-md bg-surface-muted p-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-fg">{p.cuentaNombre}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${FUERZA[p.via]}`}>{VIA_LABEL[p.via]}</span>
                    </div>
                    {/* La evidencia es lo que permite distinguir un acierto de una casualidad. */}
                    <div className="mt-0.5 text-xs text-fg-muted">{p.evidencia}</div>
                  </div>
                  <Button size="sm" disabled={ocupado !== null} onClick={() => void emparejar(c, p.cuentaId, p.cuentaNombre, p.via)} title={TIP_ES_ESTA}>
                    {ocupado === c.mercuryCustomerId ? "Guardando…" : "Es esta"}
                  </Button>
                </div>
              ))}

              {eligiendo === c.mercuryCustomerId && (
                <SelectorDeCuenta
                  cuentas={estado.cuentas}
                  ocupado={ocupado !== null}
                  onElegir={(cuenta) => void emparejar(c, cuenta.cuentaId, cuenta.nombre, "MANUAL")}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {estado.cuentasSinCliente.length > 0 && (
        <div className="rounded-lg border border-line bg-surface px-4 py-3">
          <h3 className="text-sm font-semibold text-fg">
            Cuentas que facturan por Mercury sin su cliente de Mercury ({estado.cuentasSinCliente.length})
          </h3>
          <p className="mt-0.5 text-xs text-fg-muted">
            Búscalas arriba por su razón social y empareja su cliente. Si una no factura por Mercury, cambia su vía de cobro en
            su ficha de Cobranza; si todavía no tiene facturas en Mercury, no hay nada que hacer.
          </p>
          <p className="mt-2 text-sm text-fg-secondary">{estado.cuentasSinCliente.map((c) => c.nombre).join(" · ")}</p>
        </div>
      )}

      <Seccion
        titulo={`Ya emparejados (${emparejados.length})`}
        abierta={verEmparejados}
        onToggle={() => setVerEmparejados((v) => !v)}
        nota="Una cuenta puede tener varios clientes de Mercury (otra razón social de la misma empresa). Un cliente va en una sola cuenta."
      >
        {emparejados.map((c) => (
          <div key={c.mercuryCustomerId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 last:border-0">
            <span className="w-48 shrink-0 truncate text-sm font-medium text-fg" title={c.cuentaNombre ?? ""}>
              {c.cuentaNombre}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-fg-secondary" title={c.nombre}>
                {c.nombre}
                {c.desaparecido && <span className="text-warn-ink"> · Mercury ya no lo tiene</span>}
              </div>
              <div className="text-xs text-fg-muted">
                {loQueTiene(c)}
                {c.confirmadoPor && ` · ${c.confirmadoPor}${c.confirmadoEn ? `, ${fmtFecha(c.confirmadoEn)}` : ""}`}
              </div>
            </div>
            {c.via && <Badge className="shrink-0 text-xs">{VIA_LABEL[c.via]}</Badge>}
            <Button
              variant="ghost"
              size="sm"
              disabled={ocupado !== null}
              onClick={() =>
                accion({ accion: "desvincular", mercuryCustomerId: c.mercuryCustomerId }, c.mercuryCustomerId, "Desvinculado.")
              }
              title="Sus facturas de Mercury quedan sin cuenta. Los cobros no cambian."
            >
              {ocupado === c.mercuryCustomerId ? "Guardando…" : "Desvincular"}
            </Button>
          </div>
        ))}
      </Seccion>

      {ignorados.length > 0 && (
        <Seccion
          titulo={`Marcados como no clientes (${ignorados.length})`}
          abierta={verNoClientes}
          onToggle={() => setVerNoClientes((v) => !v)}
          nota="No aparecen en la lista ni en «Lo que no cuadra». Sus facturas siguen en la copia de Mercury."
        >
          {ignorados.map((c) => (
            <div key={c.mercuryCustomerId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg" title={c.nombre}>
                  {c.nombre}
                </div>
                <div className={`text-xs ${c.porCobrar.length ? "text-warn-ink" : "text-fg-muted"}`}>
                  {loQueTiene(c)}
                  {c.confirmadoPor && ` · lo marcó ${c.confirmadoPor}${c.confirmadoEn ? ` el ${fmtFecha(c.confirmadoEn)}` : ""}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={ocupado !== null}
                onClick={() =>
                  accion(
                    { accion: "ignorar", mercuryCustomerId: c.mercuryCustomerId, ignorado: false },
                    c.mercuryCustomerId,
                    `${c.nombre} vuelve a la lista para emparejarlo.`,
                  )
                }
                title="Vuelve a la lista, para emparejarlo."
              >
                {ocupado === c.mercuryCustomerId ? "Guardando…" : "Sí es cliente"}
              </Button>
            </div>
          ))}
        </Seccion>
      )}
    </div>
  );
}

/** Elegir una cuenta de Nexus por su nombre. Se filtran acá, sin ir al servidor. */
function SelectorDeCuenta({
  cuentas,
  ocupado,
  onElegir,
}: {
  cuentas: readonly Cuenta[];
  ocupado: boolean;
  onElegir: (cuenta: Cuenta) => void;
}) {
  const [q, setQ] = useState("");
  const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const buscada = sinTildes(q.trim());
  const hits = buscada.length < 2 ? [] : cuentas.filter((c) => sinTildes(c.nombre).includes(buscada)).slice(0, 8);
  return (
    <div className="mt-2 rounded-md border border-line p-2">
      <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre de la cuenta en Nexus…" className="text-sm" />
      {buscada.length >= 2 && hits.length === 0 && (
        <p className="mt-2 text-xs text-fg-muted">
          Ninguna cuenta de Nexus se llama así. Si la empresa todavía no tiene cuenta, créala en Cobranza, con «Nueva empresa», y
          vuelve acá.
        </p>
      )}
      <div className="mt-1 max-h-56 overflow-y-auto">
        {hits.map((c) => (
          <div key={c.cuentaId} className="flex items-center gap-3 border-b border-line py-1.5 last:border-0">
            <span className="min-w-0 flex-1 truncate text-sm text-fg" title={c.nombre}>
              {c.nombre}
            </span>
            {c.via !== "MERCURY" && (
              <span className="shrink-0 text-xs text-fg-muted">factura por {c.via === "ODOO" ? "Odoo" : "QuickBooks"}</span>
            )}
            <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => onElegir(c)} title={TIP_ES_ESTA}>
              Es esta
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Seccion({
  titulo,
  abierta,
  onToggle,
  nota,
  children,
}: {
  titulo: string;
  abierta: boolean;
  onToggle: () => void;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-fg hover:bg-surface-hover"
      >
        <span className="text-fg-muted">{abierta ? "▾" : "▸"}</span>
        {titulo}
      </button>
      {abierta && (
        <div className="border-t border-line px-4 py-2">
          {nota && <p className="pb-2 text-xs text-fg-muted">{nota}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
