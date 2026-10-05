"use client";

/**
 * «A quién llamar» — una fila por cuenta, con todas sus causas a la vista y en el orden que pidió
 * Elías: una cancelación registrada primero, después lo urgente, después las cuentas sin datos y
 * el resto por gravedad. El orden lo decide `listaParaLlamar` (lib/cs/cartera-reglas.ts).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState, Segmentado, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { diasEntre, fmtDia, fmtMonto, haceCuanto } from "@/lib/cs/formato";
import { DIAS_SIN_CONTACTO, type CuentaParaBuscar, type FilaParaLlamar, type Motivo } from "@/lib/cs/cartera-reglas";
import { coincideBusqueda, filtrarPorBusqueda } from "@/lib/ui/text-search";
import { Avatar, CajaDeTabla, Chip, EncabezadoDeTabla, Flecha } from "../piezas";
import { CampoDeBusqueda, OtrasCuentas } from "./Buscar";

/** Los filtros que llegan desde la tira «Entrega de proyectos». */
export type FiltroDeEntrega = "bloqueados" | "atrasados" | "alertas";

type Filtro = "todas" | "riesgoDoble" | "cruces" | "sinDatos";

const COLUMNAS = "grid-cols-[66px_minmax(0,1fr)_minmax(0,2.2fr)_96px_104px_30px_16px]";

const NOMBRE_DEL_FILTRO_DE_ENTREGA: Record<FiltroDeEntrega, string> = {
  bloqueados: "proyectos bloqueados",
  atrasados: "proyectos atrasados",
  alertas: "alertas del agente vigía",
};

function pasaEntrega(f: FilaParaLlamar, filtro: FiltroDeEntrega): boolean {
  const claves = [f.principal, ...f.otros].map((m) => m.clave);
  if (filtro === "bloqueados") return claves.includes("bloqueado") || (claves.includes("riesgoDoble") && /bloqueado/.test(f.principal.texto));
  if (filtro === "atrasados") return claves.includes("atrasado") || (claves.includes("riesgoDoble") && /tarde/.test(f.principal.texto));
  return claves.includes("alertaDelAgente");
}

/** El chip de cada motivo extra. El primero, si es un cruce o lo vio la IA, lleva su marca. */
function ChipDeMotivo({ m }: { m: Motivo }) {
  if (m.ia) return <Chip tono="ia">{m.corto}</Chip>;
  if (m.cruce) return <Chip tono="cruce">{m.corto}</Chip>;
  return <Chip>{m.corto}</Chip>;
}

export default function Llamar({
  filas,
  cuentas: todasLasCuentas,
  cses,
  hoy,
  filtroDeEntrega,
  onQuitarFiltro,
}: {
  filas: FilaParaLlamar[];
  /** TODA la cartera, para el buscador: también las cuentas que no tienen nada que pida llamar. */
  cuentas: readonly CuentaParaBuscar[];
  /** Todos los CSE que llevan algún cliente (no solo los de esta lista), sin quienes están de baja. */
  cses: string[];
  hoy: string;
  filtroDeEntrega: FiltroDeEntrega | null;
  onQuitarFiltro: () => void;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [cse, setCse] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const buscando = busqueda.trim() !== "";

  const csesOrdenados = useMemo(() => [...cses].sort((a, b) => a.localeCompare(b, "es")), [cses]);
  const cuentas = {
    todas: filas.length,
    riesgoDoble: filas.filter((f) => f.riesgoDoble).length,
    cruces: filas.filter((f) => f.cruce).length,
    sinDatos: filas.filter((f) => f.sinDatos).length,
  };
  const visibles = filas.filter(
    (f) =>
      (filtro === "todas" || (filtro === "riesgoDoble" && f.riesgoDoble) || (filtro === "cruces" && f.cruce) || (filtro === "sinDatos" && f.sinDatos)) &&
      (!cse || f.cses.includes(cse)) &&
      (!filtroDeEntrega || pasaEntrega(f, filtroDeEntrega)) &&
      coincideBusqueda(f.nombre, busqueda),
  );
  // Lo que coincide y no está en la lista (cuentas sin nada que pida llamar): también se abre desde acá.
  const otras = useMemo(() => {
    if (!buscando) return [];
    const enLaLista = new Set(filas.map((f) => f.clientId));
    return filtrarPorBusqueda(todasLasCuentas, (c) => c.nombre, busqueda).filter((c) => !enLaLista.has(c.clientId) && (!cse || c.cses.includes(cse)));
  }, [buscando, filas, todasLasCuentas, busqueda, cse]);
  // Enter abre la primera que coincide: buscar una cuenta casi siempre es para abrirla.
  const abrirLaPrimera = () => {
    const primera = visibles[0]?.clientId ?? otras[0]?.clientId;
    if (buscando && primera) router.push(`/customer-success/${primera}`);
  };
  const buscador = <CampoDeBusqueda valor={busqueda} onCambio={setBusqueda} onEnter={abrirLaPrimera} />;

  if (filas.length === 0 && !buscando) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{buscador}</div>
        <EmptyState title="Nadie para llamar esta semana" description="Ninguna cuenta tiene un motivo abierto: ni atrasos, ni renovaciones en riesgo, ni alertas." />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-recorrido="cs.llamar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado<Filtro>
            etiqueta="Filtrar la lista"
            valor={filtro}
            onCambio={setFiltro}
            opciones={[
              { clave: "todas", etiqueta: "Todas", cuenta: cuentas.todas },
              { clave: "riesgoDoble", etiqueta: "Riesgo doble", cuenta: cuentas.riesgoDoble },
              { clave: "cruces", etiqueta: "Cruces de Nexus", cuenta: cuentas.cruces },
              { clave: "sinDatos", etiqueta: "Sin datos", cuenta: cuentas.sinDatos },
            ]}
          />
          {filtroDeEntrega && (
            <button
              type="button"
              onClick={onQuitarFiltro}
              className="inline-flex items-center gap-1 rounded-full border border-info-line bg-info-surface px-2.5 py-[3px] text-xs font-medium text-brand"
            >
              Solo {NOMBRE_DEL_FILTRO_DE_ENTREGA[filtroDeEntrega]} ✕
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {buscador}
          {csesOrdenados.length > 1 && (
          <Select aria-label="Filtrar por CSE" value={cse} onChange={(e) => setCse(e.target.value)} className="w-auto">
            <option value="">CSE: todos</option>
            {csesOrdenados.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          )}
        </div>
      </div>

      {buscando && (
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <span>
            «{busqueda.trim()}» · {visibles.length} en la lista
            {otras.length > 0 && ` · ${otras.length} fuera de ella`}
          </span>
          <button type="button" onClick={() => setBusqueda("")} className="text-brand hover:text-brand-light">
            Limpiar
          </button>
        </div>
      )}

      <CajaDeTabla minimo="min-w-[1000px]">
        <EncabezadoDeTabla columnas={COLUMNAS}>
          <span>Prioridad</span>
          <span>Cuenta</span>
          <span>Por qué llamar</span>
          <span>Renueva</span>
          <span>Último contacto</span>
          <span>CSE</span>
          <span />
        </EncabezadoDeTabla>
        {visibles.length === 0 ? (
          <p className="px-4 py-6 text-sm text-fg-muted">
            {buscando
              ? otras.length > 0
                ? "Ninguna cuenta de esta lista se llama así: mira abajo."
                : "Ninguna cuenta de la cartera se llama así. Acá están las empresas marcadas como cliente que te tocan."
              : cse
                ? `Ninguna cuenta de ${cse} tiene un motivo abierto con este filtro.`
                : "Ninguna cuenta con este filtro."}
          </p>
        ) : (
          visibles.map((f, i) => {
            const marca = f.riesgoDoble ? "Riesgo doble" : f.principal.cruce ? "Cruce de Nexus" : null;
            const frio = f.ultimoContacto ? diasEntre(f.ultimoContacto, hoy) > DIAS_SIN_CONTACTO : false;
            return (
              <Link
                key={f.clientId}
                href={`/customer-success/${f.clientId}`}
                className={cn("grid items-center gap-4 px-4 py-3.5 text-fg transition-colors hover:bg-surface-hover", COLUMNAS, i > 0 && "border-t border-line")}
              >
                <span>{f.prioridad === "alta" ? <Chip tono="atencion">Alta</Chip> : <Chip>Media</Chip>}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">{f.nombre}</span>
                  <span className="text-xs text-fg-muted">{f.mrr !== null ? `${fmtMonto(f.mrr, f.moneda)} al mes` : "monto sin dato"}</span>
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[13px]">{f.principal.texto}</span>
                  {(marca || f.principal.ia || f.otros.length > 0) && (
                    <span className="flex flex-wrap gap-1.5">
                      {marca && <Chip tono="cruce">{marca}</Chip>}
                      {f.principal.ia && <Chip tono="ia">Lo vio el agente vigía</Chip>}
                      {f.otros.slice(0, 3).map((m) => (
                        <ChipDeMotivo key={m.clave + m.texto} m={m} />
                      ))}
                      {f.otros.length > 3 && <span className="text-xs text-fg-muted">y {f.otros.length - 3} más</span>}
                    </span>
                  )}
                </span>
                <span className={cn("text-[13px]", f.renueva ? "text-fg" : "text-fg-muted")}>{f.renueva ? fmtDia(f.renueva, hoy) : "sin dato"}</span>
                <span className={cn("text-[13px]", frio ? "text-warn-ink" : "text-fg-secondary")}>{f.ultimoContacto ? haceCuanto(f.ultimoContacto, hoy) : "sin registro"}</span>
                <Avatar nombre={f.cse?.nombre ?? null} />
                <Flecha />
              </Link>
            );
          })
        )}
      </CajaDeTabla>
      <p className="text-xs text-fg-muted">
        Una fila por cuenta. Primero una cancelación registrada, después lo urgente, después las cuentas sin datos y el resto por
        gravedad. El último contacto es la reunión más reciente en Nexus o el último registro en HubSpot.
      </p>
      {otras.length > 0 && <OtrasCuentas cuentas={otras} hoy={hoy} />}
    </div>
  );
}
