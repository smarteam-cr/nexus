"use client";

/**
 * «Equipo» — cómo está cada CSE, para las reuniones uno a uno (rediseño 2026-10-09, entrega 4 de
 * docs/exito-del-cliente-cartera-plan.md): sus cuentas, las recurrentes contra la meta (de 6 a 7, configurable en
 * los supuestos de la carga), cuántas en riesgo, en espera del cliente, sin contacto y con la relación de HubSpot
 * por vencer, el uso promedio, los atrasos y bloqueos de sus proyectos y sus horas (la 1:1 en la carga).
 *
 * Cada número abre la pestaña «Cartera» con ese filtro. Una cuenta con dos CSE cuenta para quien lleva más
 * proyectos en ella (el mismo CSE que filtra la cartera). Los atrasos y bloqueos son POR PROYECTO, de quien lo lleva.
 */
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { RUTA_DE_LA_CARGA, RUTA_DE_LOS_SUPUESTOS, rutaDeLaUnoAUno } from "@/lib/carga/rutas";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/cs/formato";
import { UMBRALES } from "@/lib/cs/lectura-partner";
import type { FilaDeEquipo } from "@/lib/cs/cartera-reglas";
import type { CuentaSinCse } from "@/lib/cs/sin-cse";
import CseEncargadoSelect, { type OpcionDeEncargado } from "@/components/clients/CseEncargadoSelect";
import type { FilaDeLaCartera } from "@/lib/cs/clasificacion";
import { cifrasDelCse, contraLaMeta, filtroDeLaCifra, type CifrasDelCse, type FiltrosDeCartera } from "@/lib/cs/filtros-de-cartera";
import { Avatar, CajaDeTabla, EncabezadoDeTabla } from "../piezas";

const COLUMNAS = "grid-cols-[minmax(0,1.2fr)_64px_150px_70px_70px_76px_92px_80px_72px_72px_64px]";

export default function Equipo({
  equipo,
  cartera,
  meta,
  idsDelEquipo,
  sinCse,
  equipoParaPase,
  puedeReasignar,
  onVer,
}: {
  equipo: { filas: FilaDeEquipo[]; proyectosSinCse: number; deBaja: { nombre: string; proyectos: number }[] };
  cartera: readonly FilaDeLaCartera[];
  /** Cuántas recurrentes lleva bien un CSE. */
  meta: { min: number; max: number };
  /** El id de cada persona por correo, para su 1:1 en la carga. */
  idsDelEquipo: Record<string, string>;
  /** Las cuentas con proyectos activos sin CSE y a quién propone Nexus. */
  sinCse: readonly CuentaSinCse[];
  equipoParaPase: OpcionDeEncargado[];
  puedeReasignar: boolean;
  onVer: (f: FiltrosDeCartera) => void;
}) {
  if (equipo.filas.length === 0 && equipo.proyectosSinCse === 0) {
    return <EmptyState title="Sin CSE asignados" description="Ningún proyecto activo tiene un CSE en HubSpot." />;
  }
  const tope = Math.max(meta.max + 2, ...equipo.filas.map((f) => cifrasDelCse(cartera, f.nombre).recurrentes));
  const n = (x: number, alerta = false) => <span className={cn("text-right tabular-nums", alerta && x > 0 && "font-semibold text-warn-ink")}>{x}</span>;
  return (
    <div className="space-y-3" data-recorrido="cs.equipo">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <span className="text-[13px] text-fg-secondary">
          <span className="font-semibold text-fg">Recurrentes por CSE:</span> la meta es de {meta.min} a {meta.max}.{" "}
          <span className="text-fg-muted">Cada número abre esas cuentas en «Cartera».</span>
        </span>
        <span className="flex flex-wrap items-center gap-4">
          <Link href={RUTA_DE_LOS_SUPUESTOS} className="text-xs text-fg-muted transition-colors hover:text-fg">
            Cambiar la meta
          </Link>
          <Link href={RUTA_DE_LA_CARGA} className="text-xs font-semibold text-brand transition-colors hover:text-brand-light">
            Ver la carga del equipo
          </Link>
        </span>
      </div>
      <CajaDeTabla minimo="min-w-[1120px]">
        <EncabezadoDeTabla columnas={COLUMNAS}>
          <span>CSE</span>
          <span className="text-right">Cuentas</span>
          <span>Recurrentes</span>
          <span className="text-right">En riesgo</span>
          <span className="text-right">En espera</span>
          <span className="text-right">Sin contacto</span>
          <span className="text-right">HubSpot por vencer</span>
          <span>Uso promedio</span>
          <span className="text-right">Atrasados</span>
          <span className="text-right">Bloqueados</span>
          <span className="text-right">Horas</span>
        </EncabezadoDeTabla>
        {equipo.filas.map((f, i) => {
          const c = cifrasDelCse(cartera, f.nombre);
          const id = f.email ? idsDelEquipo[f.email.toLowerCase()] : undefined;
          const ver = (cifra: keyof CifrasDelCse) => () => onVer(filtroDeLaCifra(f.nombre, cifra));
          return (
            <div key={f.email ?? f.nombre} className={cn("grid items-center gap-4 px-4 py-3.5 text-[13px] text-fg", COLUMNAS, i > 0 && "border-t border-line")}>
              <span className="flex min-w-0 items-center gap-2">
                <Avatar nombre={f.nombre} />
                <span className="truncate text-sm font-semibold">{f.nombre}</span>
              </span>
              <Cifra onClick={ver("cuentas")} titulo={`Ver las ${c.cuentas} cuentas de ${f.nombre}`}>
                {n(c.cuentas)}
              </Cifra>
              <button type="button" onClick={ver("recurrentes")} className="flex items-center gap-2 text-left" title={`Ver sus recurrentes · meta de ${meta.min} a ${meta.max}`}>
                <BarraDeLaMeta valor={c.recurrentes} meta={meta} tope={tope} />
                <span className={cn("tabular-nums", contraLaMeta(c.recurrentes, meta) === "arriba" && "font-semibold text-warn-ink")}>{c.recurrentes}</span>
              </button>
              <Cifra onClick={ver("enRiesgo")} titulo="Ver las que están en riesgo">
                {n(c.enRiesgo, true)}
              </Cifra>
              <Cifra onClick={ver("enEspera")} titulo="Ver las que esperan al cliente">
                {n(c.enEspera)}
              </Cifra>
              <Cifra onClick={ver("sinContacto")} titulo="Ver las que no tienen contacto reciente">
                {n(c.sinContacto, true)}
              </Cifra>
              <Cifra onClick={ver("relacionPorVencer")} titulo="Ver las que pierden la relación con HubSpot">
                {n(c.relacionPorVencer, true)}
              </Cifra>
              <span className={cn("tabular-nums", f.usoPromedio !== null && f.usoPromedio < UMBRALES.usoBajo && "text-warn-ink")}>
                {f.usoPromedio ?? <span className="text-fg-muted">sin dato</span>}
              </span>
              {n(f.atrasados, true)}
              {n(f.bloqueados, true)}
              <span className="text-right">
                {id ? (
                  <Link href={rutaDeLaUnoAUno(id)} className="text-xs font-semibold text-brand transition-colors hover:text-brand-light">
                    Ver
                  </Link>
                ) : (
                  <span className="text-fg-muted">—</span>
                )}
              </span>
            </div>
          );
        })}
        {equipo.proyectosSinCse > 0 && (
          <div className={cn("grid items-center gap-4 bg-warn-surface px-4 py-3.5 text-[13px]", COLUMNAS, equipo.filas.length > 0 && "border-t border-line")}>
            <span className="flex items-center gap-2">
              <Avatar nombre={null} />
              <span className="text-sm font-semibold text-warn-ink">Sin CSE asignado</span>
            </span>
            <span className="col-span-9 text-warn-ink">
              {plural(equipo.proyectosSinCse, "proyecto activo", "proyectos activos")} sin encargado
              {equipo.deBaja.length > 0
                ? `, ${equipo.deBaja.reduce((s, d) => s + d.proyectos, 0)} de gente que ya no está en el equipo: ${equipo.deBaja.map((d) => `${d.nombre} (${d.proyectos})`).join(", ")}.`
                : "."}
            </span>
            <span className="text-right text-xs text-warn-ink">{sinCse.length > 0 ? "abajo" : "pase de cuenta"}</span>
          </div>
        )}
      </CajaDeTabla>
      {sinCse.length > 0 && <CuentasSinCse cuentas={sinCse} opciones={equipoParaPase} puedeReasignar={puedeReasignar} />}
      <p className="text-xs text-fg-muted">
        Una cuenta con dos CSE cuenta para quien lleva más proyectos en ella. Recurrente = el tipo de relación confirmado (o
        propuesto) en «Cartera». Atrasados y bloqueados son proyectos.
      </p>
    </div>
  );
}

/**
 * Las cuentas con proyectos activos sin CSE (etapa 4a): Nexus propone a quién, la CSL lo confirma con la misma celda
 * del pase de cuenta, que escribe «CSE Encargado» en HubSpot. Nada se asigna solo.
 */
function CuentasSinCse({
  cuentas,
  opciones,
  puedeReasignar,
}: {
  cuentas: readonly CuentaSinCse[];
  opciones: OpcionDeEncargado[];
  puedeReasignar: boolean;
}) {
  const conPropuesta = cuentas.filter((c) => c.propuesta).length;
  return (
    <section className="space-y-2" aria-labelledby="cuentas-sin-cse">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cuentas-sin-cse" className="text-sm font-semibold text-fg">
          Cuentas sin CSE · {cuentas.length}
        </h2>
        <span className="text-xs text-fg-muted">
          {conPropuesta > 0
            ? `Nexus propone en ${conPropuesta}: elígelo para confirmarlo. Se escribe en HubSpot como «CSE Encargado».`
            : "Elige quién lleva cada una. Se escribe en HubSpot como «CSE Encargado»."}
        </span>
      </div>
      <CajaDeTabla minimo="min-w-[760px]">
        <EncabezadoDeTabla columnas={COLUMNAS_SIN_CSE}>
          <span>Cuenta</span>
          <span>Proyectos sin CSE</span>
          <span>CSE encargado</span>
          <span>Por qué</span>
        </EncabezadoDeTabla>
        {cuentas.map((c, i) => (
          <div key={c.clientId} className={cn("grid items-start gap-4 px-4 py-3 text-[13px] text-fg", COLUMNAS_SIN_CSE, i > 0 && "border-t border-line")}>
            <Link href={`/customer-success/${c.clientId}`} className="truncate font-semibold transition-colors hover:text-brand">
              {c.nombre}
            </Link>
            <span className="min-w-0 text-fg-secondary">
              {c.proyectos.join(" · ")}
              {c.deBaja.length > 0 && <span className="block text-xs text-fg-muted">Estaba a nombre de {c.deBaja.join(", ")}.</span>}
            </span>
            <CseEncargadoSelect
              clientId={c.clientId}
              clientName={c.nombre}
              encargado={null}
              opciones={puedeReasignar ? opciones : []}
              puedeEditar={puedeReasignar}
              sugerencia={c.propuesta?.email}
            />
            <span className="text-xs text-fg-muted">{c.propuesta ? c.propuesta.motivo : "Nadie del equipo estuvo en sus reuniones de los últimos 90 días."}</span>
          </div>
        ))}
      </CajaDeTabla>
    </section>
  );
}

const COLUMNAS_SIN_CSE = "grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_180px_minmax(0,1fr)]";

function Cifra({ onClick, titulo, children }: { onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={titulo} className="rounded text-right transition-colors hover:text-brand">
      {children}
    </button>
  );
}

/** La barra de las recurrentes con la banda de la meta pintada detrás. */
function BarraDeLaMeta({ valor, meta, tope }: { valor: number; meta: { min: number; max: number }; tope: number }) {
  const pct = (x: number) => `${Math.min(100, (x / tope) * 100)}%`;
  const donde = contraLaMeta(valor, meta);
  return (
    <span aria-hidden className="relative h-2 w-20 overflow-hidden rounded-full bg-surface-hover">
      <span className="absolute inset-y-0 bg-success-surface" style={{ left: pct(meta.min), width: `calc(${pct(meta.max)} - ${pct(meta.min)})` }} />
      <span
        className={cn("absolute inset-y-0 left-0 rounded-full", donde === "arriba" ? "bg-warning" : donde === "en-la-meta" ? "bg-success" : "bg-fg-muted")}
        style={{ width: pct(valor) }}
      />
    </span>
  );
}
