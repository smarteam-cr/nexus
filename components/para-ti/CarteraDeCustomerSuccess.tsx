"use client";

/**
 * CarteraDeCustomerSuccess — «Tu cartera» de Customer Success en «Para ti» (2026-10-17). El hermano de la cartera de
 * Ventas (VentasDeParaTi.tsx), especializado para administrar cuentas.
 *
 * Una fila por empresa: el nombre grande, quién la lleva (el CSE de la cuenta y el encargado de cada proyecto), el color
 * de Éxito del cliente y su porqué, cada proyecto de HubSpot con su etapa, el último contacto y la próxima reunión, la
 * renovación, la acción de la semana y, a quien ve Ventas, el monto de sus negocios abiertos.
 *
 * Las vistas viven en `?cartera=` (lo que se comparte es la vista); el buscador y los filtros, en la pantalla. Qué es
 * cada vista y por qué está en lib/mi-dia/cartera-cs.ts.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchFilterBar, Segmentado, Select } from "@/components/ui";
import { BotonTexto } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { cuandoEsLaReunion, DIAS_PARA_LA_REUNION } from "@/lib/mi-dia/servicio";
import { DIAS_SIN_CONTACTO } from "@/lib/cs/cartera-reglas";
import {
  diasHastaElDia,
  diasSinContacto,
  filtrarEmpresas,
  hayFiltros,
  montoUsd,
  NOMBRE_DEL_PIPELINE,
  opcionesDeFiltros,
  paraAtender,
  porCse,
  renuevanPronto,
  SIN_FILTROS,
  sinContacto,
  todas,
  type EmpresaDeCs,
  type FiltrosDeCs,
  type MotivoDeAtencion,
  type PipelineDeCs,
  type SaludDeCs,
} from "@/lib/mi-dia/cartera-cs";
import type { CarteraDeCs } from "@/lib/mi-dia/cartera-cs-server";
import { NOMBRE_DE_SALUD, Punto, PUNTO_DE_SALUD } from "./inicio/piezas";

type Vista = "atender" | "todos" | "por-cse" | "sin-contacto" | "renuevan";
const VISTAS: readonly Vista[] = ["atender", "todos", "por-cse", "sin-contacto", "renuevan"];

const CHIP = "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-medium leading-4";
const CHIP_NEUTRO = "border-line bg-surface-muted text-fg-muted";
const CHIP_DE_MOTIVO = (m: MotivoDeAtencion) =>
  m.peso >= 90 ? "border-danger-line bg-danger-surface text-danger-ink" : "border-warn-line bg-warn-surface text-warn-ink";
const CHIP_DE_PIPELINE: Record<PipelineDeCs, string> = {
  "customer-success": "border-info-line bg-info-surface text-info-ink",
  smartloop: "border-success-line bg-success-surface text-success-ink",
  development: CHIP_NEUTRO,
};
const ENLACE = "text-xs font-medium text-brand transition-colors hover:text-brand-light";
const FILTRO = "w-auto";

const QUE_ES_LA_VISTA: Record<Vista, string> = {
  atender: "Las cuentas que piden una decisión: en riesgo o con señales, un proyecto bloqueado, renueva en 30 días, sin contacto o sin acción esta semana.",
  todos: "Toda la cartera, con cada proyecto de HubSpot y su etapa. Lo rojo arriba.",
  "por-cse": "Cada CSE con sus cuentas y lo que pide atención, para la 1:1. En orden alfabético.",
  "sin-contacto": `${DIAS_SIN_CONTACTO} días o más sin una reunión con el cliente ni actividad en HubSpot. La más vieja primero.`,
  renuevan: "Las licencias que renuevan en los próximos 90 días, la más cercana primero.",
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1] ?? ""}`;

function textoDelContacto(e: EmpresaDeCs, hoyISO: string): string {
  const d = diasSinContacto(e, hoyISO);
  if (d === null) return "Sin contacto registrado";
  if (d === 0) return "Último contacto hoy";
  if (d === 1) return "Último contacto ayer";
  return `Último contacto hace ${d} días`;
}

export default function CarteraDeCustomerSuccess({ cartera, hoyISO }: { cartera: CarteraDeCs; hoyISO: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [f, setF] = useState<FiltrosDeCs>(SIN_FILTROS);
  const cambiar = (c: Partial<FiltrosDeCs>) => setF((v) => ({ ...v, ...c }));

  const pedida = params.get("cartera") as Vista | null;
  const vistas = cartera.lider ? VISTAS : VISTAS.filter((v) => v !== "por-cse");
  const vista: Vista = pedida && vistas.includes(pedida) ? pedida : "atender";
  const onVista = (v: Vista) => {
    const p = new URLSearchParams(params.toString());
    if (v === "atender") p.delete("cartera");
    else p.set("cartera", v);
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const opciones = useMemo(() => opcionesDeFiltros(cartera.empresas), [cartera.empresas]);
  const empresas = useMemo(() => filtrarEmpresas(cartera.empresas, f), [cartera.empresas, f]);
  const atender = useMemo(() => paraAtender(empresas, hoyISO), [empresas, hoyISO]);
  const frias = useMemo(() => sinContacto(empresas, hoyISO), [empresas, hoyISO]);
  const renuevan = useMemo(() => renuevanPronto(empresas, hoyISO), [empresas, hoyISO]);
  const grupos = useMemo(() => (cartera.lider ? porCse(empresas, hoyISO) : []), [cartera.lider, empresas, hoyISO]);
  const lista = useMemo(() => todas(empresas), [empresas]);

  const cuenta: Record<Vista, number> = {
    atender: atender.length,
    todos: empresas.length,
    "por-cse": grupos.filter((g) => g.cse).length,
    "sin-contacto": frias.length,
    renuevan: renuevan.length,
  };
  const etiqueta: Record<Vista, string> = {
    atender: "Para atender",
    todos: "Todos los proyectos",
    "por-cse": "Por CSE",
    "sin-contacto": "Sin contacto",
    renuevan: "Renuevan pronto",
  };
  const proyectos = cartera.empresas.reduce((n, e) => n + e.proyectos.length, 0);
  const enRiesgo = cartera.empresas.filter((e) => e.salud === "riesgo").length;

  return (
    <div className="space-y-4">
      <Segmentado etiqueta="Vista de la cartera" opciones={vistas.map((v) => ({ clave: v, etiqueta: etiqueta[v], cuenta: cuenta[v] }))} valor={vista} onCambio={onVista} />
      <p className="text-[13px] text-fg-muted">
        {QUE_ES_LA_VISTA[vista]} {cartera.lider ? "La cartera" : "Tu cartera"} son {plural(cartera.empresas.length, "empresa", "empresas")} con{" "}
        {plural(proyectos, "proyecto abierto", "proyectos abiertos")} de implementación, SmartLoop y desarrollo
        {enRiesgo > 0 ? `; ${plural(enRiesgo, "está", "están")} en riesgo alto` : ""}.
        {!cartera.lider && " El color se ve en las cuentas que llevas."}
      </p>

      <SearchFilterBar search={{ value: f.texto, onChange: (texto) => cambiar({ texto }), placeholder: "Buscar empresa, proyecto o persona…" }}>
        <Select className={FILTRO} aria-label="Color" value={f.color} onChange={(e) => cambiar({ color: e.target.value as FiltrosDeCs["color"] })}>
          <option value="">Todos los colores</option>
          {(["riesgo", "senales", "espera", "bien", "sin-datos"] as SaludDeCs[]).map((s) => (
            <option key={s} value={s}>
              {NOMBRE_DE_SALUD[s]}
            </option>
          ))}
          {!cartera.lider && <option value="ninguno">Sin color (compartidas)</option>}
        </Select>
        {cartera.lider && (
          <Select className={FILTRO} aria-label="CSE" value={f.cse} onChange={(e) => cambiar({ cse: e.target.value })}>
            <option value="">Todos los CSE</option>
            {opciones.cses.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.nombre}
              </option>
            ))}
            {opciones.haySinCse && <option value="sin">Sin CSE</option>}
          </Select>
        )}
        {opciones.pipelines.length > 1 && (
          <Select className={FILTRO} aria-label="Pipeline" value={f.pipeline} onChange={(e) => cambiar({ pipeline: e.target.value as FiltrosDeCs["pipeline"] })}>
            <option value="">Todos los pipelines</option>
            {opciones.pipelines.map((p) => (
              <option key={p} value={p}>
                {NOMBRE_DEL_PIPELINE[p]}
              </option>
            ))}
          </Select>
        )}
        {opciones.etapas.length > 0 && (
          <Select className={FILTRO} aria-label="Etapa" value={f.etapa} onChange={(e) => cambiar({ etapa: e.target.value })}>
            <option value="">Todas las etapas</option>
            {opciones.etapas.map((et) => (
              <option key={et} value={et}>
                {et}
              </option>
            ))}
          </Select>
        )}
        {hayFiltros(f) && <BotonTexto onClick={() => setF(SIN_FILTROS)}>Quitar filtros</BotonTexto>}
      </SearchFilterBar>

      {vista === "atender" && (
        <Lista vacia="Ninguna cuenta pide una decisión hoy: todas tienen contacto reciente y su acción de la semana.">
          {atender.map(({ empresa, motivos }) => (
            <FilaDeEmpresa key={empresa.clientId} e={empresa} motivos={motivos} hoyISO={hoyISO} cartera={cartera} />
          ))}
        </Lista>
      )}

      {vista === "todos" && (
        <Lista vacia="No hay cuentas con estos filtros.">
          {lista.map((e) => (
            <FilaDeEmpresa key={e.clientId} e={e} motivos={null} hoyISO={hoyISO} cartera={cartera} />
          ))}
        </Lista>
      )}

      {vista === "por-cse" && (
        <div className="space-y-4">
          {grupos.length === 0 && <Lista vacia="No hay cuentas con estos filtros.">{[]}</Lista>}
          {grupos.map((g) => (
            <section key={g.cse?.email ?? g.cse?.nombre ?? "sin"} aria-label={g.cse?.nombre ?? "Sin CSE"} className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
                <h3 className={cn("text-sm font-semibold", g.cse ? "text-fg" : "text-warn-ink")}>{g.cse?.nombre ?? "Sin CSE"}</h3>
                <span className="text-xs text-fg-muted">
                  {plural(g.empresas.length, "cuenta", "cuentas")} · {plural(g.proyectos, "proyecto", "proyectos")}
                  {g.enRiesgo > 0 && ` · ${g.enRiesgo} en riesgo`}
                  {g.sinAccion > 0 && ` · ${g.sinAccion} sin acción`}
                  {g.sinContacto > 0 && ` · ${g.sinContacto} sin contacto`}
                </span>
              </div>
              <Lista vacia="">
                {g.empresas.map((e) => (
                  <FilaDeEmpresa key={e.clientId} e={e} motivos={null} hoyISO={hoyISO} cartera={cartera} sinCse />
                ))}
              </Lista>
            </section>
          ))}
        </div>
      )}

      {vista === "sin-contacto" && (
        <Lista vacia={`Todas las cuentas tuvieron contacto en los últimos ${DIAS_SIN_CONTACTO} días.`}>
          {frias.map((e) => (
            <FilaDeEmpresa key={e.clientId} e={e} motivos={null} hoyISO={hoyISO} cartera={cartera} />
          ))}
        </Lista>
      )}

      {vista === "renuevan" && (
        <Lista vacia="Ninguna cuenta renueva licencias en los próximos 90 días.">
          {renuevan.map((e) => (
            <FilaDeEmpresa key={e.clientId} e={e} motivos={null} hoyISO={hoyISO} cartera={cartera} />
          ))}
        </Lista>
      )}
    </div>
  );
}

function Lista({ vacia, children }: { vacia: string; children: React.ReactNode[] }) {
  if (children.length === 0) {
    return vacia ? <div className="rounded-xl border border-dashed border-line bg-surface-muted p-5 text-center text-[13px] text-fg-muted">{vacia}</div> : null;
  }
  return <section className="overflow-hidden rounded-xl border border-line bg-surface">{children}</section>;
}

/** Una empresa: quién y cómo está · sus proyectos y la relación · lo de esta semana. Se apila en un celular. */
function FilaDeEmpresa({
  e,
  motivos,
  hoyISO,
  cartera,
  sinCse,
}: {
  e: EmpresaDeCs;
  motivos: MotivoDeAtencion[] | null;
  hoyISO: string;
  cartera: CarteraDeCs;
  /** En «Por CSE» el CSE ya está en el título del grupo. */
  sinCse?: boolean;
}) {
  const sinCalendario = !e.calendarioLeido;
  const renueva = e.renovacion ? diasHastaElDia(e.renovacion, hoyISO) : null;
  const datos = [
    textoDelContacto(e, hoyISO),
    e.proxima ? `Próxima reunión ${cuandoEsLaReunion(e.proxima.inicio, hoyISO)}` : sinCalendario ? "Calendario sin leer" : `Sin reunión en ${DIAS_PARA_LA_REUNION} días`,
    e.renovacion ? `Renueva el ${fechaCorta(e.renovacion)}${renueva !== null && renueva <= 30 ? ` (en ${plural(renueva, "día", "días")})` : ""}` : null,
    e.contactos ? plural(e.contactos, "persona en HubSpot", "personas en HubSpot") : null,
    e.ticketsAbiertos ? plural(e.ticketsAbiertos, "ticket abierto", "tickets abiertos") : null,
  ].filter(Boolean);
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-2 border-t border-line px-4 py-3.5 first:border-t-0 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,15rem)]">
      {/* Quién y cómo está. */}
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          {e.salud ? (
            <Punto className={PUNTO_DE_SALUD[e.salud]} />
          ) : (
            <span title="Ves el color de las cuentas que llevas">
              <Punto className="border-[1.5px] border-line bg-transparent" />
            </span>
          )}
          <Link href={`/clients/${encodeURIComponent(e.clientId)}`} className="min-w-0 truncate text-[15px] font-semibold leading-5 text-fg transition-colors hover:text-brand" title={e.nombre}>
            {e.nombre}
          </Link>
        </div>
        {e.salud && (
          <p className="text-xs leading-4 text-fg-secondary" title={e.motivos.length ? e.motivos.join(" · ") : undefined}>
            <span className="font-medium text-fg">{NOMBRE_DE_SALUD[e.salud]}</span>
            {e.porque ? ` · ${e.porque}` : ""}
          </p>
        )}
        {!sinCse && (
          <p className="text-xs leading-4 text-fg-muted">
            {e.cse ? (
              <>CSE: {e.cse.nombre}</>
            ) : (
              <span className="text-warn-ink">Sin CSE{e.cseDeBaja ? ` · era de ${e.cseDeBaja}, que está de baja` : ""}</span>
            )}
            {!cartera.lider && !e.tuya && <span className={cn(CHIP, CHIP_NEUTRO, "ml-1.5")}>Compartida</span>}
          </p>
        )}
      </div>

      {/* Sus proyectos y la relación. */}
      <div className="min-w-0 space-y-1.5">
        {motivos && motivos.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {motivos.map((m) => (
              <span key={m.clave} className={cn(CHIP, CHIP_DE_MOTIVO(m))}>
                {m.texto}
              </span>
            ))}
          </div>
        )}
        <ul className="space-y-0.5">
          {e.proyectos.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] leading-5 text-fg-secondary">
              <span className={cn(CHIP, CHIP_DE_PIPELINE[p.pipeline])}>{NOMBRE_DEL_PIPELINE[p.pipeline]}</span>
              {p.hubspotUrl ? (
                <a href={p.hubspotUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate font-medium text-fg hover:text-brand" title={`${p.nombre} · abrir en HubSpot`}>
                  {p.nombre}
                </a>
              ) : (
                <span className="min-w-0 truncate font-medium text-fg">{p.nombre}</span>
              )}
              <span className="text-fg-muted">
                {[p.etapa ?? "Sin etapa", p.encargado ? `lo lleva ${p.encargado}` : "sin encargado"].join(" · ")}
              </span>
              {p.bloqueado && <span className={cn(CHIP, "border-danger-line bg-danger-surface text-danger-ink")}>Bloqueado</span>}
              {p.atrasoDias != null && <span className={cn(CHIP, "border-warn-line bg-warn-surface text-warn-ink")}>{plural(p.atrasoDias, "día de atraso", "días de atraso")}</span>}
            </li>
          ))}
        </ul>
        <p className="text-xs leading-4 text-fg-muted">
          {datos.join(" · ")}
          {e.relacion && (
            <span className={cn(e.relacion.tono === "ambar" ? "text-warn-ink" : e.relacion.tono === "verde" ? "text-success-ink" : "")}>
              {datos.length ? " · " : ""}HubSpot: {e.relacion.corto}
            </span>
          )}
        </p>
        {e.negocios && (
          <p className="text-xs leading-4 text-fg-secondary">
            {plural(e.negocios.cantidad, "negocio abierto", "negocios abiertos")}
            {e.negocios.montoUsd != null && ` · ${montoUsd(e.negocios.montoUsd)}`}
            {e.negocios.otrasMonedas > 0 && ` · ${e.negocios.otrasMonedas} en otra moneda`}
          </p>
        )}
      </div>

      {/* Lo de esta semana. */}
      <div className="flex min-w-0 flex-col gap-1 text-xs leading-4 lg:items-end lg:text-right">
        {e.accion ? (
          <span className="text-success-ink" title={`T-${e.accion.numero} · ${e.accion.titulo}`}>
            ✓ <span className="text-fg-secondary">T-{e.accion.numero} · {e.accion.titulo}</span>
          </span>
        ) : (
          <span className="font-medium text-warn-ink">○ Sin acción esta semana</span>
        )}
        {e.proxima && (
          <span className="truncate text-fg-muted" title={e.proxima.titulo}>
            {cuandoEsLaReunion(e.proxima.inicio, hoyISO)} · {e.proxima.titulo}
          </span>
        )}
        <Link href={`/clients/${encodeURIComponent(e.clientId)}`} className={ENLACE}>
          Abrir la cuenta
        </Link>
      </div>
    </div>
  );
}
