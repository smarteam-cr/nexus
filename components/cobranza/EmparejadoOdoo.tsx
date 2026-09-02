"use client";

/**
 * components/cobranza/EmparejadoOdoo.tsx
 *
 * Decir qué cliente de Odoo es qué cuenta de Nexus. Es trabajo de una tarde que se hace una
 * sola vez, y de él depende que el espejo de facturas quede bien atribuido.
 *
 * ── POR QUÉ NO ES «CONFIRMÁ ESTAS 49 PROPUESTAS» ────────────────────────────────
 * Medido contra los datos reales: **15 de 49** cuentas tienen candidato de primera. Con 28
 * huecos, una pantalla de confirmación sería una pantalla vacía. Así que el **buscador es el
 * flujo principal** y las propuestas son el atajo.
 *
 * ⚠ Y toda propuesta muestra SU EVIDENCIA. La señal de monto acierta 8 de 9: sin ver por qué
 * se propuso, la persona no puede hacer otra cosa que aceptar todo — y el error que se cuela
 * cuelga las facturas de un cliente de la cuenta de otro.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, EmptyState, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";

type Via = "CEDULA" | "MONTO" | "NOMBRE" | "MANUAL";
type Clase = "CEDULA" | "NOMBRE_EXACTO" | "MONTO" | "DUDOSA" | "SIN_CANDIDATO" | "INEMPAREJABLE";

interface Candidato {
  odooPartnerId: number;
  nombre: string;
  via: Via;
  evidencia: string;
}
interface Propuesta {
  cuentaId: string;
  cuentaNombre: string;
  clase: Clase;
  candidatos: Candidato[];
}
interface Vinculo {
  odooPartnerId: number;
  odooPartnerNombre: string;
  odooVat: string | null;
  cuentaId: string | null;
  cuentaNombre: string | null;
  via: string | null;
  ignorado: boolean;
  confirmadoPor: string | null;
}
interface PartnerOdoo {
  odooPartnerId: number;
  nombre: string;
  vat: string | null;
  customerRank: number;
}
interface Estado {
  propuestas: Propuesta[];
  vinculos: Vinculo[];
  partners: PartnerOdoo[];
  conteos: {
    cuentas: number;
    cuentasVinculadas: number;
    partners: number;
    partnersVinculados: number;
    partnersIgnorados: number;
    facturasLeidas: number;
  };
  errorOdoo: string | null;
}

/**
 * Cada clase dice DE DÓNDE salió la propuesta, y eso cambia cuánto hay que mirarla. La
 * cédula no tiene falsos positivos; el monto tiene uno de cada nueve.
 */
const CLASE_META: Record<Clase, { label: string; chip: string; orden: number; nota?: string }> = {
  CEDULA: { label: "Por cédula", chip: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30", orden: 0 },
  NOMBRE_EXACTO: { label: "Nombre exacto", chip: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30", orden: 1 },
  MONTO: {
    label: "Por monto",
    chip: "text-sky-600 bg-sky-500/10 border-sky-500/30",
    orden: 2,
    nota: "Acierta 8 de cada 9. Mirá la evidencia antes de confirmar.",
  },
  DUDOSA: {
    label: "Nombre parecido",
    chip: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    orden: 3,
    nota: "Nexus guarda el nombre comercial y Odoo la razón social: parecerse no alcanza.",
  },
  SIN_CANDIDATO: { label: "Sin candidato", chip: "text-fg-muted bg-surface-muted border-line", orden: 4 },
  INEMPAREJABLE: {
    label: "Nombre sin señal",
    chip: "text-fg-muted bg-surface-muted border-line",
    orden: 5,
    nota: "El nombre de la cuenta es demasiado corto para comparar. Buscalo a mano.",
  },
};

const VIA_LABEL: Record<string, string> = {
  CEDULA: "cédula",
  MONTO: "monto",
  NOMBRE: "nombre",
  MANUAL: "a mano",
};

export default function EmparejadoOdoo() {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [buscandoPara, setBuscandoPara] = useState<string | null>(null);
  const [verVinculados, setVerVinculados] = useState(false);
  const [verSinUsar, setVerSinUsar] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setEstado(await fetchJson<Estado>("/api/cobranza/odoo/emparejado"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el emparejado.");
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const accion = useCallback(
    async (body: Record<string, unknown>, clave: string, exito: string) => {
      setOcupado(clave);
      try {
        const r = await fetchJson<{ cedulaAprendida?: string | null; conflictoCedula?: { nexus: string; odoo: string } | null }>(
          "/api/cobranza/odoo/emparejado",
          { method: "POST", body: JSON.stringify(body) },
        );
        /* ⚠ El conflicto de cédula se DICE. Es la única señal sin falsos positivos y que
           Nexus y Odoo tengan dos números distintos para el mismo cliente significa que uno
           de los dos está mal — o que el vínculo lo está. */
        if (r?.conflictoCedula) {
          toast.error(
            `Vinculado, pero las cédulas no coinciden: Nexus tiene ${r.conflictoCedula.nexus} y Odoo ${r.conflictoCedula.odoo}. No se pisó ninguna.`,
          );
        } else if (r?.cedulaAprendida) {
          toast.success(`${exito} Se guardó la cédula ${r.cedulaAprendida} en la cuenta.`);
        } else {
          toast.success(exito);
        }
        setBuscandoPara(null);
        await cargar();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
      } finally {
        setOcupado(null);
      }
    },
    [cargar, toast],
  );

  const pendientes = useMemo(
    () => (estado?.propuestas ?? []).slice().sort((a, b) => CLASE_META[a.clase].orden - CLASE_META[b.clase].orden),
    [estado],
  );
  const vinculados = useMemo(() => (estado?.vinculos ?? []).filter((v) => v.cuentaId), [estado]);
  const sinUsar = useMemo(() => (estado?.vinculos ?? []).filter((v) => !v.cuentaId && !v.ignorado), [estado]);
  const ignorados = useMemo(() => (estado?.vinculos ?? []).filter((v) => v.ignorado), [estado]);

  if (cargando && !estado) {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-fg-muted">
        <Spinner /> Consultando Odoo…
      </div>
    );
  }
  if (!estado) return <EmptyState title="No se pudo cargar" description="Probá de nuevo en un momento." />;

  const { conteos } = estado;

  return (
    <div className="space-y-6">
      {/* ⚠ Si Odoo no contestó, el trabajo ya hecho sigue a la vista — pero se dice, en vez
          de mostrar cero propuestas como si el emparejado estuviera completo. */}
      {estado.errorOdoo && (
        <Alert variant="danger" title="No se pudo consultar Odoo">
          {estado.errorOdoo}
          <span className="mt-1 block text-fg-secondary">
            Lo de abajo es lo que ya estaba guardado. Las propuestas por monto necesitan el ERP.
          </span>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        <span className="text-fg">
          <strong className="text-lg tabular-nums">{conteos.cuentasVinculadas}</strong>
          <span className="text-fg-muted"> de {conteos.cuentas} cuentas vinculadas</span>
        </span>
        <span className="text-fg-muted">
          {conteos.partners} clientes en Odoo · {conteos.partnersIgnorados} marcados como ajenos
        </span>
        {conteos.facturasLeidas > 0 && (
          <span className="text-fg-muted">{conteos.facturasLeidas} facturas leídas para proponer</span>
        )}
        <Button variant="secondary" size="sm" className="ml-auto" onClick={() => void cargar()} disabled={cargando}>
          {cargando ? "Consultando…" : "Actualizar desde Odoo"}
        </Button>
      </div>

      {pendientes.length === 0 ? (
        <EmptyState
          title="No queda ninguna cuenta por vincular"
          description="Todas las cuentas de Nexus tienen su cliente de Odoo. El sync puede espejar sin riesgo de atribuir mal."
        />
      ) : (
        <div className="space-y-2">
          {pendientes.map((p) => (
            <FilaCuenta
              key={p.cuentaId}
              propuesta={p}
              ocupado={ocupado === p.cuentaId}
              buscando={buscandoPara === p.cuentaId}
              onBuscar={() => setBuscandoPara(buscandoPara === p.cuentaId ? null : p.cuentaId)}
              onConfirmar={(odooPartnerId, via) =>
                accion(
                  { accion: "confirmar", odooPartnerId, cuentaId: p.cuentaId, via, aprenderCedula: true },
                  p.cuentaId,
                  `${p.cuentaNombre} quedó vinculada.`,
                )
              }
            />
          ))}
        </div>
      )}

      <Seccion
        titulo={`Clientes de Odoo sin usar (${sinUsar.length})`}
        abierta={verSinUsar}
        onToggle={() => setVerSinUsar((v) => !v)}
        nota="Odoo tiene más clientes que Nexus cuentas, y la diferencia es historia, no un hueco. Marcá acá los que no son clientes nuestros para que dejen de aparecer."
      >
        {sinUsar.map((v) => (
          <div key={v.odooPartnerId} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
            <span className="min-w-0 flex-1 truncate text-sm text-fg" title={v.odooPartnerNombre}>
              {v.odooPartnerNombre}
            </span>
            {v.odooVat && <span className="shrink-0 font-mono text-xs text-fg-muted">{v.odooVat}</span>}
            <Button
              variant="ghost"
              size="sm"
              disabled={ocupado === `p${v.odooPartnerId}`}
              onClick={() =>
                accion(
                  { accion: "ignorar", odooPartnerId: v.odooPartnerId, ignorado: true },
                  `p${v.odooPartnerId}`,
                  "Marcado como ajeno.",
                )
              }
            >
              No es cliente nuestro
            </Button>
          </div>
        ))}
      </Seccion>

      <Seccion
        titulo={`Ya vinculadas (${vinculados.length})`}
        abierta={verVinculados}
        onToggle={() => setVerVinculados((v) => !v)}
      >
        {vinculados.map((v) => (
          <div key={v.odooPartnerId} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
            <span className="w-48 shrink-0 truncate text-sm font-medium text-fg">{v.cuentaNombre}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary" title={v.odooPartnerNombre}>
              {v.odooPartnerNombre}
            </span>
            {v.via && (
              <Badge className="shrink-0 text-xs">
                {VIA_LABEL[v.via] ?? v.via.toLowerCase()}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={ocupado === `p${v.odooPartnerId}`}
              onClick={() =>
                accion({ accion: "desvincular", odooPartnerId: v.odooPartnerId }, `p${v.odooPartnerId}`, "Desvinculado.")
              }
            >
              Desvincular
            </Button>
          </div>
        ))}
      </Seccion>

      {ignorados.length > 0 && (
        <p className="text-xs text-fg-muted">
          {ignorados.length} clientes de Odoo están marcados como ajenos.{" "}
          <button
            type="button"
            className="underline hover:text-fg"
            onClick={() =>
              accion(
                { accion: "ignorar", odooPartnerId: ignorados[0]!.odooPartnerId, ignorado: false },
                `p${ignorados[0]!.odooPartnerId}`,
                `«${ignorados[0]!.odooPartnerNombre}» vuelve a la lista.`,
              )
            }
          >
            Devolver el primero a la lista
          </button>
        </p>
      )}
    </div>
  );
}

/* ── Una cuenta pendiente ────────────────────────────────────────────────────────── */

function FilaCuenta({
  propuesta,
  ocupado,
  buscando,
  onBuscar,
  onConfirmar,
}: {
  propuesta: Propuesta;
  ocupado: boolean;
  buscando: boolean;
  onBuscar: () => void;
  onConfirmar: (odooPartnerId: number, via: Via) => void;
}) {
  const meta = CLASE_META[propuesta.clase];
  const principal = propuesta.candidatos[0];

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-fg">{propuesta.cuentaNombre}</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${meta.chip}`}>{meta.label}</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onBuscar}>
          {buscando ? "Cerrar" : "Buscar en Odoo"}
        </Button>
      </div>

      {meta.nota && <p className="mt-1 text-xs text-fg-muted">{meta.nota}</p>}

      {principal && (
        <div className="mt-2 flex flex-wrap items-start gap-3 rounded-md bg-surface-muted p-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-fg" title={principal.nombre}>
              {principal.nombre}
            </div>
            {/* La evidencia no es decoración: es lo único que le permite a la persona
                distinguir un acierto de un monto que dos clientes comparten. */}
            <div className="mt-0.5 text-xs text-fg-muted">{principal.evidencia}</div>
          </div>
          <Button
            size="sm"
            disabled={ocupado}
            onClick={() => onConfirmar(principal.odooPartnerId, principal.via)}
          >
            {ocupado ? "Guardando…" : "Es este"}
          </Button>
        </div>
      )}

      {propuesta.candidatos.length > 1 && (
        <div className="mt-2 space-y-1">
          {propuesta.candidatos.slice(1).map((c) => (
            <div key={c.odooPartnerId} className="flex items-center gap-3 pl-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-fg-secondary" title={c.evidencia}>
                {c.nombre}
              </span>
              <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => onConfirmar(c.odooPartnerId, c.via)}>
                Es este
              </Button>
            </div>
          ))}
        </div>
      )}

      {buscando && <Buscador ocupado={ocupado} onElegir={(id) => onConfirmar(id, "MANUAL")} />}
    </div>
  );
}

/* ── El buscador, que es el flujo principal ──────────────────────────────────────── */

function Buscador({ ocupado, onElegir }: { ocupado: boolean; onElegir: (odooPartnerId: number) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PartnerOdoo[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    /* Se espera a que dejen de escribir: una consulta por tecla contra 82 filas es gratis de
       escribir y cara de sostener. */
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetchJson<{ partners: PartnerOdoo[] }>(
          `/api/cobranza/odoo/emparejado?q=${encodeURIComponent(q)}`,
        );
        setHits(r.partners);
      } catch {
        setHits([]);
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mt-2 rounded-md border border-line p-2">
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nombre o cédula del cliente en Odoo…"
        className="text-sm"
      />
      {buscando && <p className="mt-2 text-xs text-fg-muted">Buscando…</p>}
      {!buscando && q.trim().length >= 2 && hits.length === 0 && (
        <p className="mt-2 text-xs text-fg-muted">
          Nada con ese nombre ni esa cédula. Odoo puede tenerlo con la razón social completa.
        </p>
      )}
      <div className="mt-1 max-h-56 overflow-y-auto">
        {hits.map((p) => (
          <div key={p.odooPartnerId} className="flex items-center gap-3 border-b border-line py-1.5 last:border-0">
            <span className="min-w-0 flex-1 truncate text-sm text-fg" title={p.nombre}>
              {p.nombre}
            </span>
            {p.vat && <span className="shrink-0 font-mono text-xs text-fg-muted">{p.vat}</span>}
            <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => onElegir(p.odooPartnerId)}>
              Es este
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Una sección plegable ────────────────────────────────────────────────────────── */

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
