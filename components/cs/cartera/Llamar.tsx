"use client";

/**
 * «A quién llamar» — una fila por cuenta, con su color, todas sus causas a la vista y sus alertas
 * para resolver ahí mismo. El orden lo decide `listaParaLlamar` (lib/cs/cartera-reglas.ts): primero
 * el color (rojo, sin datos, amarillo, verde) y, dentro, una cancelación registrada primero, después
 * lo urgente, después las cuentas sin datos y el resto por gravedad.
 *
 * El color sale de `saludDeLaCuenta` y al pasar el mouse dice por qué. Las alertas del agente vigía
 * NO pintan: se resuelven o descartan con una nota corta, todas juntas en la vista «Alertas» (la
 * revisión de los primeros 10 minutos del día de la CSL, 2026-10-07) o desde el botón de su fila.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState, Segmentado, Select } from "@/components/ui";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { coincideBusqueda } from "@/lib/ui/text-search";
import { diasEntre, fmtDia, fmtMonto, haceCuanto, plural } from "@/lib/cs/formato";
import {
  DIAS_SIN_CONTACTO,
  buscarEnLaLista,
  pasaEntrega,
  type AlertaCerrada,
  type CuentaConAlertas,
  type CuentaParaBuscar,
  type EntregaDeProyectos,
  type FilaParaLlamar,
  type FiltroDeEntrega,
  type Motivo,
} from "@/lib/cs/cartera-reglas";
import { Avatar, CajaDeTabla, Chip, EncabezadoDeTabla, Flecha, Salud } from "../piezas";
import { AlertaParaCerrar, AlertasCerradas } from "../AlertaParaCerrar";
import { CampoDeBusqueda, OtrasCuentas } from "./Buscar";

/** Los filtros que llegan desde la tira «Entrega de proyectos» (la regla vive en cartera-reglas). */
export type { FiltroDeEntrega };

type Filtro = "todas" | "alertas" | "riesgoDoble" | "cruces" | "sinDatos";

const COLUMNAS = "grid-cols-[136px_minmax(0,1fr)_minmax(0,2.2fr)_96px_104px_30px_16px]";

const NOMBRE_DEL_FILTRO_DE_ENTREGA: Record<FiltroDeEntrega, string> = {
  bloqueados: "cuentas con un proyecto bloqueado",
  atrasados: "cuentas con un proyecto atrasado",
  alertas: "cuentas con una alerta alta del agente vigía",
};

/** El chip de cada motivo extra. El primero, si es un cruce o lo vio la IA, lleva su marca. */
function ChipDeMotivo({ m }: { m: Motivo }) {
  if (m.ia) return <Chip tono="ia">{m.corto}</Chip>;
  if (m.cruce) return <Chip tono="cruce">{m.corto}</Chip>;
  return <Chip>{m.corto}</Chip>;
}

/**
 * La vista «Alertas»: cada cuenta con sus alertas abiertas y, en cada una, Resolver y Descartar a la
 * vista. Es la revisión del día: lo que se cierra sale de la lista sin esperar al servidor.
 */
function VistaDeAlertas({
  cuentas,
  hoy,
  cerradasAca,
  onCerrada,
  hayFiltro,
}: {
  cuentas: readonly CuentaConAlertas[];
  hoy: string;
  cerradasAca: ReadonlySet<string>;
  onCerrada: (id: string) => void;
  hayFiltro: boolean;
}) {
  const conAlertas = cuentas
    .map((c) => ({ ...c, alertas: c.alertas.filter((a) => !cerradasAca.has(a.id)) }))
    .filter((c) => c.alertas.length > 0);
  if (conAlertas.length === 0) {
    return (
      <EmptyState
        title={hayFiltro ? "Ninguna alerta con este filtro" : "No queda ninguna alerta abierta"}
        description={hayFiltro ? "Prueba con otra búsqueda o con «CSE: todos»." : "Lo que cerraste se puede consultar abajo, en las alertas cerradas."}
      />
    );
  }
  return (
    <div className="space-y-3">
      {conAlertas.map((c) => (
        <section key={c.clientId} className="rounded-xl border border-line bg-surface">
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
            <Salud salud={c.salud} porque={c.porqueDeLaSalud} corto />
            <Link href={`/customer-success/${c.clientId}`} className="text-sm font-semibold text-fg hover:text-brand">
              {c.nombre}
            </Link>
            <span className="text-xs text-fg-muted">{plural(c.alertas.length, "alerta abierta", "alertas abiertas")}</span>
          </header>
          <div className="grid gap-2 p-3 md:grid-cols-2">
            {c.alertas.map((a) => (
              <AlertaParaCerrar key={a.id} alerta={a} hoy={hoy} onCerrada={onCerrada} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function Llamar({
  filas,
  cuentas: todasLasCuentas,
  alertas: cuentasConAlertas,
  cerradas,
  cses,
  hoy,
  entrega,
  filtroDeEntrega,
  onQuitarFiltro,
}: {
  filas: FilaParaLlamar[];
  /** Todas las cuentas, para el buscador: también las que no tienen nada que pida llamar (la pestaña «Cartera» las lista). */
  cuentas: readonly CuentaParaBuscar[];
  /** Las alertas abiertas de TODAS las cuentas, para la vista «Alertas». */
  alertas: readonly CuentaConAlertas[];
  /** Las alertas cerradas de los últimos 30 días: salen de la lista, pero se consultan. */
  cerradas: readonly AlertaCerrada[];
  /** Todos los CSE que llevan algún cliente (no solo los de esta lista), sin quienes están de baja. */
  cses: string[];
  hoy: string;
  /** Las cuentas de cada botón de «Entrega de proyectos»: el filtro lista exactamente esas. */
  entrega: EntregaDeProyectos;
  filtroDeEntrega: FiltroDeEntrega | null;
  onQuitarFiltro: () => void;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [cse, setCse] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  // Las filas con las alertas abiertas, y las alertas que se cerraron acá (salen sin esperar al servidor).
  const [conAlertasAbiertas, setConAlertasAbiertas] = useState<ReadonlySet<string>>(new Set());
  const [alertasCerradasAca, setAlertasCerradasAca] = useState<ReadonlySet<string>>(new Set());
  const [verCerradas, setVerCerradas] = useState(false);
  const buscando = busqueda.trim() !== "";
  const enAlertas = filtro === "alertas";
  const hayFiltro = (filtro !== "todas" && !enAlertas) || !!filtroDeEntrega;

  const csesOrdenados = useMemo(() => [...cses].sort((a, b) => a.localeCompare(b, "es")), [cses]);
  const cuentas = {
    todas: filas.length,
    riesgoDoble: filas.filter((f) => f.riesgoDoble).length,
    cruces: filas.filter((f) => f.cruce).length,
    sinDatos: filas.filter((f) => f.sinDatos).length,
    alertas: cuentasConAlertas.reduce((n, c) => n + c.alertas.filter((a) => !alertasCerradasAca.has(a.id)).length, 0),
  };
  // Las filas que se ven y, al buscar, lo que coincide y no se ve (cuentas sin nada que pida llamar
  // o que el filtro deja afuera): también se abre desde acá.
  const { visibles, otras } = useMemo(
    () =>
      buscarEnLaLista(filas, todasLasCuentas, {
        busqueda,
        cse,
        pasaLosFiltros: (f) =>
          (filtro === "todas" || (filtro === "riesgoDoble" && f.riesgoDoble) || (filtro === "cruces" && f.cruce) || (filtro === "sinDatos" && f.sinDatos)) &&
          (!filtroDeEntrega || pasaEntrega(f, filtroDeEntrega, entrega)),
      }),
    [filas, todasLasCuentas, busqueda, cse, filtro, filtroDeEntrega, entrega],
  );
  // «Alertas»: las de todas las cuentas, con el mismo CSE y la misma búsqueda que la lista.
  const alertasVisibles = useMemo(
    () => cuentasConAlertas.filter((c) => (!cse || c.cses.includes(cse)) && coincideBusqueda(c.nombre, busqueda)),
    [cuentasConAlertas, cse, busqueda],
  );
  // Enter abre la primera que coincide: buscar una cuenta casi siempre es para abrirla.
  const abrirLaPrimera = () => {
    const primera = enAlertas ? alertasVisibles[0]?.clientId : (visibles[0]?.clientId ?? otras[0]?.clientId);
    if (buscando && primera) router.push(`/customer-success/${primera}`);
  };
  const buscador = <CampoDeBusqueda valor={busqueda} onCambio={setBusqueda} onEnter={abrirLaPrimera} />;
  const alternarAlertas = (clientId: string) =>
    setConAlertasAbiertas((s) => {
      const n = new Set(s);
      if (n.has(clientId)) n.delete(clientId);
      else n.add(clientId);
      return n;
    });
  const alertaCerrada = (id: string) => {
    setAlertasCerradasAca((s) => new Set(s).add(id));
    router.refresh();
  };

  const historial = cerradas.length > 0 && (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setVerCerradas((v) => !v)}
        aria-expanded={verCerradas}
        className="text-xs text-fg-muted transition-colors hover:text-fg"
      >
        {verCerradas ? "Ocultar las alertas cerradas" : `Ver las alertas cerradas en los últimos 30 días · ${cerradas.length}`}
      </button>
      {verCerradas && <AlertasCerradas alertas={cerradas} hoy={hoy} conCuenta />}
    </section>
  );

  if (filas.length === 0 && !buscando && !enAlertas) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{buscador}</div>
        <EmptyState title="Nadie para llamar esta semana" description="Ninguna cuenta tiene un motivo abierto: ni atrasos, ni renovaciones en riesgo, ni alertas." />
        {historial}
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
              { clave: "alertas", etiqueta: "Alertas", cuenta: cuentas.alertas },
              { clave: "riesgoDoble", etiqueta: "Riesgo doble", cuenta: cuentas.riesgoDoble },
              { clave: "cruces", etiqueta: "Cruces de Nexus", cuenta: cuentas.cruces },
              { clave: "sinDatos", etiqueta: "Sin datos", cuenta: cuentas.sinDatos },
            ]}
          />
          {filtroDeEntrega && !enAlertas && (
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
            «{busqueda.trim()}» ·{" "}
            {enAlertas ? plural(alertasVisibles.length, "cuenta con alertas", "cuentas con alertas") : `${visibles.length} en la lista`}
            {!enAlertas && otras.length > 0 && ` · ${otras.length} fuera de ella`}
          </span>
          <button type="button" onClick={() => setBusqueda("")} className="text-brand hover:text-brand-light">
            Limpiar
          </button>
        </div>
      )}

      {enAlertas ? (
        <VistaDeAlertas
          cuentas={alertasVisibles}
          hoy={hoy}
          cerradasAca={alertasCerradasAca}
          onCerrada={alertaCerrada}
          hayFiltro={buscando || !!cse}
        />
      ) : (
        <CajaDeTabla minimo="min-w-[1040px]">
          <EncabezadoDeTabla columnas={COLUMNAS}>
            <span>Color</span>
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
                  : cse
                    ? `Ninguna cuenta de ${cse} se llama así.`
                    : "Ninguna cuenta de la cartera se llama así. Acá están las empresas marcadas como cliente que te tocan."
                : cse
                  ? `Ninguna cuenta de ${cse} tiene un motivo abierto con este filtro.`
                  : "Ninguna cuenta con este filtro."}
            </p>
          ) : (
            visibles.map((f, i) => {
              const marca = f.riesgoDoble ? "Riesgo doble" : f.principal.cruce ? "Cruce de Nexus" : null;
              const frio = f.ultimoContacto ? diasEntre(f.ultimoContacto, hoy) > DIAS_SIN_CONTACTO : false;
              const alertas = f.alertas.filter((a) => !alertasCerradasAca.has(a.id));
              const abiertas = conAlertasAbiertas.has(f.clientId) && alertas.length > 0;
              const delAgente = alertas.some((a) => a.delAgente);
              // Con el botón de las alertas en la fila, cada alerta del agente no repite su chip.
              const otros = alertas.length > 0 ? f.otros.filter((m) => m.clave !== "alertaDelAgente") : f.otros;
              return (
                <div key={f.clientId} className={cn(i > 0 && "border-t border-line")}>
                  {/* La fila entera abre la cuenta (el enlace del nombre la cubre); el color y las
                      alertas quedan por encima, para el porqué y para abrirlas sin salir. */}
                  <div className={cn("relative grid items-center gap-4 px-4 py-3.5 text-fg transition-colors hover:bg-surface-hover", COLUMNAS)}>
                    <span className="relative z-[1] justify-self-start">
                      <Salud salud={f.salud} porque={f.porqueDeLaSalud} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <Link href={`/customer-success/${f.clientId}`} className="truncate text-sm font-semibold after:absolute after:inset-0">
                        {f.nombre}
                      </Link>
                      <span className="text-xs text-fg-muted">{f.mrr !== null ? `${fmtMonto(f.mrr, f.moneda)} al mes` : "monto sin dato"}</span>
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-[13px]">{f.principal.texto}</span>
                      {(marca || f.principal.ia || otros.length > 0 || alertas.length > 0) && (
                        <span className="flex flex-wrap items-center gap-1.5">
                          {marca && <Chip tono="cruce">{marca}</Chip>}
                          {f.principal.ia && <Chip tono="ia">Lo vio el agente vigía</Chip>}
                          {otros.slice(0, 3).map((m) => (
                            <ChipDeMotivo key={m.clave + m.texto} m={m} />
                          ))}
                          {otros.length > 3 && <span className="text-xs text-fg-muted">y {otros.length - 3} más</span>}
                          {alertas.length > 0 && (
                            <button
                              type="button"
                              onClick={() => alternarAlertas(f.clientId)}
                              aria-expanded={abiertas}
                              className="relative z-[1] inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-[3px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
                            >
                              {delAgente && <IconoDeSugerencia className="h-[13px] w-[13px] flex-shrink-0 text-brand" />}
                              {abiertas ? "Ocultar las alertas" : `Revisar ${plural(alertas.length, "alerta", "alertas")}`}
                              <span aria-hidden className={cn("text-[10px] transition-transform", abiertas && "rotate-180")}>
                                ▾
                              </span>
                            </button>
                          )}
                        </span>
                      )}
                    </span>
                    <span className={cn("text-[13px]", f.renueva ? "text-fg" : "text-fg-muted")}>{f.renueva ? fmtDia(f.renueva, hoy) : "sin dato"}</span>
                    <span className={cn("text-[13px]", frio ? "text-warn-ink" : "text-fg-secondary")}>{f.ultimoContacto ? haceCuanto(f.ultimoContacto, hoy) : "sin registro"}</span>
                    <Avatar nombre={f.cse?.nombre ?? null} />
                    <Flecha />
                  </div>
                  {abiertas && (
                    <div className="grid gap-2 border-t border-line bg-surface-muted px-4 py-3 md:grid-cols-2">
                      {alertas.map((a) => (
                        <AlertaParaCerrar key={a.id} alerta={a} hoy={hoy} onCerrada={alertaCerrada} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CajaDeTabla>
      )}
      <p className="text-xs text-fg-muted">
        {enAlertas
          ? "Las alertas abiertas de todas las cuentas, las de una cuenta con alerta alta primero. Al cerrarla puedes dejar una nota de qué se hizo; vuelve solo si aparece algo nuevo."
          : "Una fila por cuenta: primero el color (rojo, sin datos, amarillo, verde) y, dentro de cada uno, una cancelación registrada, lo urgente, las cuentas sin datos y el resto por gravedad. Pasa el mouse por el color para ver por qué lo tiene. Las alertas del agente no pintan el color: se resuelven o descartan en la fila."}
      </p>
      {!enAlertas && otras.length > 0 && <OtrasCuentas cuentas={otras} hoy={hoy} conFiltro={hayFiltro} />}
      {historial}
    </div>
  );
}
