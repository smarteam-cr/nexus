"use client";

/**
 * VentasDeParaTi — lo de Ventas en «Para ti» (2026-10-14, etapa 1 de docs/mi-dia-plan.md).
 *
 * Arriba, la meta del año, lo ponderado y el pipeline. Dos vistas, por `?vista=`:
 *   · «Tu día»: los cierres más cerca (y abajo, lo de siempre de «Para ti»).
 *   · «Tu cartera»: las empresas de las que eres dueño en HubSpot y las de tus negocios abiertos, en cuatro vistas
 *     (`?cartera=`): para mover hoy, pipeline, por limpiar y sin negocio. Con buscador y filtros.
 * La pregunta de la fecha de cierre y el monto se contesta acá (`?negocio=<id>`) y se guarda en HubSpot.
 * El siguiente paso de Ventas de cada negocio o empresa se define acá también (etapa 2): se guarda en Nexus y en HubSpot.
 *
 * Las fechas y los días se calculan con `hoyISO` y `ahoraISO` del servidor: con el reloj del navegador, el servidor y
 * el navegador podían pintar distinto.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Field, Input, Modal, SearchFilterBar, Segmentado, Select } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/api/fetch-json";
import { avisarCambioDeParaTi } from "./cuenta";
import DialogoDelSiguientePaso, { type ObjetoParaElPaso } from "@/components/siguiente-paso/DialogoDelSiguientePaso";
import { LineaDelPaso } from "@/components/siguiente-paso/LineaDelPaso";
import type { VistaDeVentas } from "@/lib/ventas/cartera-server";
import {
  accionDelNegocio,
  cierresMasCerca,
  DIAS_DE_CIERRE_CERCANO,
  diasHasta,
  esPausado,
  fechaCorta,
  montoCorto,
  pasoDeVentas,
  pasoVencido,
  preguntaDelNegocio,
  senalesDelNegocio,
  temperaturaDelNegocio,
  TEXTO_DE_SENAL,
  TEXTO_DE_TEMPERATURA,
  vistasDeCartera,
  type AccionDelNegocio,
  type EmpresaDeCartera,
  type NegocioVisto,
  type PropuestaDeCierre,
  type Temperatura,
  type TipoDeEmpresa,
} from "@/lib/ventas/negocios";

type Negocio = VistaDeVentas["negocios"][number];
export type ModoDeVentas = "dia" | "cartera";
type VistaDeCartera = "mover" | "pipeline" | "limpiar" | "sin-negocio";
const VISTAS: readonly VistaDeCartera[] = ["mover", "pipeline", "limpiar", "sin-negocio"];

const CHIP = "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-medium leading-4";
const COLOR_DE_TEMPERATURA: Record<Temperatura, string> = {
  caliente: "border-success-line bg-success-surface text-success-ink",
  "en-movimiento": "border-info-line bg-info-surface text-info-ink",
  frio: "border-line bg-surface-muted text-fg-muted",
};
const TEXTO_DE_TIPO: Record<Exclude<TipoDeEmpresa, null>, string> = { CLIENTE: "Cliente", PROSPECTO: "Prospecto", OTRO: "Otra" };
const ENLACE = "text-xs text-brand hover:text-brand-light";
const FILTRO = "w-auto";

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

function hace(iso: string | null, ahora: Date): string {
  if (!iso) return "sin actividad registrada";
  const dias = Math.floor((ahora.getTime() - Date.parse(iso)) / 86_400_000);
  if (dias <= 0) return "actividad hoy";
  if (dias === 1) return "actividad ayer";
  return `actividad hace ${dias} días`;
}

function textoDeCierre(fecha: string | null, hoyISO: string): string {
  if (!fecha) return "Sin fecha de cierre";
  const d = diasHasta(fecha, hoyISO);
  if (d === 0) return "Cierra hoy";
  if (d === 1) return "Cierra mañana";
  if (d > 1) return `${d} días al cierre · ${fechaCorta(fecha)}`;
  return `Cierre vencido · ${fechaCorta(fecha)}`;
}

function ChipDeTipo({ tipo }: { tipo: TipoDeEmpresa }) {
  if (tipo !== "CLIENTE" && tipo !== "PROSPECTO") return null;
  return <span className={cn(CHIP, "border-line bg-surface-muted text-fg-muted")}>{TEXTO_DE_TIPO[tipo]}</span>;
}

function NombreDeEmpresa({ nombre, clientId, className }: { nombre: string; clientId: string | null; className?: string }) {
  return clientId ? (
    <Link href={`/clients/${clientId}`} className={cn("hover:text-brand", className)}>
      {nombre}
    </Link>
  ) : (
    <span className={className}>{nombre}</span>
  );
}

export default function VentasDeParaTi({
  vista,
  modo,
  hoyISO,
  ahoraISO,
  negocioAbierto,
}: {
  vista: VistaDeVentas;
  modo: ModoDeVentas;
  hoyISO: string;
  ahoraISO: string;
  negocioAbierto: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const ahora = useMemo(() => new Date(ahoraISO), [ahoraISO]);
  const [actualizando, setActualizando] = useState(false);

  const cambiarParams = useCallback(
    (cambios: Record<string, string | null>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(cambios)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const actualizar = useCallback(async () => {
    setActualizando(true);
    try {
      const r = await fetchJson<{ omitido?: string; traidos?: number }>("/api/sales/negocios/actualizar", { method: "POST" });
      if (r.omitido === "reciente") toast.info("Los negocios se trajeron de HubSpot hace menos de 2 minutos.");
      else if (r.omitido === "en-curso") toast.info("Ya se están trayendo los negocios de HubSpot.");
      else toast.success(`Se trajeron ${plural(r.traidos ?? 0, "negocio abierto", "negocios abiertos")} de HubSpot.`);
      avisarCambioDeParaTi();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron traer los negocios.");
    } finally {
      setActualizando(false);
    }
  }, [router, toast]);

  const cercanos = useMemo(() => cierresMasCerca(vista.negocios, hoyISO), [vista.negocios, hoyISO]);
  const abierto = negocioAbierto ? (vista.negocios.find((n) => n.id === negocioAbierto) ?? null) : null;
  const completar = useCallback((id: string) => cambiarParams({ negocio: id }), [cambiarParams]);
  const [definiendo, setDefiniendo] = useState<ObjetoParaElPaso | null>(null);
  const definir = useCallback((o: ObjetoParaElPaso) => setDefiniendo(o), []);

  return (
    <div className="space-y-4">
      {/* En «Tu día» (el inicio de la ficha D, 2026-10-17) esto solo deja los diálogos: los números, los cierres y la
          agenda los pinta el inicio. El selector «Tu día · Tu cartera» vive en la cabecera de la página. */}
      {modo === "cartera" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="ml-auto text-xs text-fg-muted">
              {vista.copiadoAt ? `Negocios traídos de HubSpot: ${hace(vista.copiadoAt, ahora).replace("actividad ", "")}` : "Todavía no se trajeron los negocios de HubSpot."}
            </span>
            <BotonBlanco onClick={actualizar} disabled={actualizando}>
              {actualizando ? "Trayendo…" : "Actualizar"}
            </BotonBlanco>
          </div>

          <Cifras vista={vista} />

          <CierresMasCerca negocios={cercanos} hoyISO={hoyISO} ahora={ahora} onCompletar={completar} onDefinir={definir} />

          <Cartera
            vista={vista}
            hoyISO={hoyISO}
            ahora={ahora}
            vistaActiva={(VISTAS as readonly string[]).includes(params.get("cartera") ?? "") ? (params.get("cartera") as VistaDeCartera) : "mover"}
            onVista={(v) => cambiarParams({ cartera: v === "mover" ? null : v })}
            onCompletar={completar}
            onDefinir={definir}
          />
        </>
      )}

      {definiendo && (
        <DialogoDelSiguientePaso
          objeto={definiendo}
          equipoInicial="ventas"
          onCerrar={(cambio) => {
            setDefiniendo(null);
            if (cambio) {
              avisarCambioDeParaTi();
              router.refresh();
            }
          }}
        />
      )}

      {abierto && (
        <PreguntaDelNegocio
          negocio={abierto}
          hoyISO={hoyISO}
          ahora={ahora}
          onCerrar={(cambio) => {
            cambiarParams({ negocio: null });
            if (cambio) {
              avisarCambioDeParaTi();
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}

function Cifras({ vista }: { vista: VistaDeVentas }) {
  const { meta, ponderado } = vista;
  const pct = meta?.cumplimiento != null ? Math.round(meta.cumplimiento * 100) : null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className={ROTULO_DEL_SISTEMA}>Tu meta {vista.anio}</div>
        {meta ? (
          <>
            <div className="mt-1 text-xl font-semibold tabular-nums text-fg">
              {meta.avance != null ? montoCorto(meta.avance, meta.moneda) : "—"}
              <span className="text-sm font-normal text-fg-muted"> de {montoCorto(meta.monto, meta.moneda)}</span>
            </div>
            {pct != null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            )}
            <div className="mt-1.5 text-xs text-fg-muted">{pct != null ? `${pct} % según HubSpot` : "HubSpot no dio el avance"}</div>
          </>
        ) : (
          <div className="mt-1 text-sm text-fg-muted">No tienes una meta de ventas en HubSpot.</div>
        )}
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className={ROTULO_DEL_SISTEMA}>Ponderado {vista.anio}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums text-fg">{montoCorto(ponderado.usd, "USD")}</div>
        <div className="mt-1.5 text-xs text-fg-muted">
          Monto × probabilidad de lo activo que cierra este año
          {ponderado.fueraDelAnio > 0 && ` · ${plural(ponderado.fueraDelAnio, "negocio cierra", "negocios cierran")} después`}
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className={ROTULO_DEL_SISTEMA}>Pipeline activo</div>
        <div className="mt-1 text-xl font-semibold tabular-nums text-fg">{montoCorto(ponderado.pipelineUsd, "USD")}</div>
        <div className="mt-1.5 text-xs text-fg-muted">
          {plural(ponderado.activos, "negocio activo", "negocios activos")}
          {ponderado.sinMonto > 0 && ` · ${ponderado.sinMonto} sin monto`}
          {ponderado.pausados > 0 && ` · ${plural(ponderado.pausados, "pausado", "pausados")} fuera`}
          {ponderado.enOtraMoneda > 0 && ` · ${ponderado.enOtraMoneda} en otra moneda`}
        </div>
      </div>
    </div>
  );
}

/** Lo que se le pasa al diálogo del siguiente paso para un negocio. */
function pasoDelNegocio(n: NegocioVisto): ObjetoParaElPaso {
  return { objeto: "negocio", objetoId: n.id, nombre: n.nombre, detalle: `${n.empresa} · ${n.etapa}`, pasos: n.pasos ?? [], sugerencia: n.siguientePasoHubspot };
}

function CierresMasCerca({
  negocios,
  hoyISO,
  ahora,
  onCompletar,
  onDefinir,
}: {
  negocios: Negocio[];
  hoyISO: string;
  ahora: Date;
  onCompletar: (id: string) => void;
  onDefinir: (o: ObjetoParaElPaso) => void;
}) {
  return (
    <section aria-label="Cierres más cerca" className="space-y-2">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-[15px] font-semibold text-fg">Cierres más cerca</h2>
        <span className="text-xs text-fg-muted">los que cierran en los próximos {DIAS_DE_CIERRE_CERCANO} días</span>
      </div>
      {negocios.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface-muted p-4 text-[13px] text-fg-muted">
          Ningún negocio tuyo cierra en los próximos {DIAS_DE_CIERRE_CERCANO} días. En «Tu cartera» están todos.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {negocios.slice(0, 6).map((n) => (
            <TarjetaDeNegocio key={n.id} n={n} hoyISO={hoyISO} ahora={ahora} onCompletar={onCompletar} onDefinir={onDefinir} />
          ))}
        </div>
      )}
      {negocios.length > 6 && <p className="text-xs text-fg-muted">Y {negocios.length - 6} más en «Tu cartera» › Pipeline.</p>}
    </section>
  );
}

function TarjetaDeNegocio({
  n,
  hoyISO,
  ahora,
  onCompletar,
  onDefinir,
}: {
  n: Negocio;
  hoyISO: string;
  ahora: Date;
  onCompletar: (id: string) => void;
  onDefinir: (o: ObjetoParaElPaso) => void;
}) {
  const temp = temperaturaDelNegocio(n, hoyISO, ahora);
  const pregunta = preguntaDelNegocio(n, hoyISO, ahora);
  // El siguiente paso se dice abajo, en su línea: no se repite como señal.
  const senales = senalesDelNegocio(n, hoyISO, ahora).filter((s) => s !== "sin-siguiente-paso" && s !== "siguiente-paso-vencido");
  const paso = pasoDeVentas(n);
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <NombreDeEmpresa nombre={n.empresa} clientId={n.clientId} className="block truncate text-sm font-semibold text-fg" />
          <div className="truncate text-xs text-fg-muted" title={n.nombre}>
            {n.nombre}
          </div>
        </div>
        <span className={cn(CHIP, COLOR_DE_TEMPERATURA[temp])}>{TEXTO_DE_TEMPERATURA[temp]}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-secondary">{textoDeCierre(n.fechaCierre, hoyISO)}</span>
        <span className="text-[15px] font-semibold tabular-nums text-fg">{n.monto != null ? montoCorto(n.monto, n.moneda) : "Sin monto"}</span>
      </div>
      <div className="text-xs text-fg-muted">
        {n.etapa}
        {n.probabilidad != null && ` · ${Math.round(n.probabilidad * 100)} %`} · {hace(ultima(n), ahora)}
      </div>
      <LineaDelPaso paso={paso} hoyISO={hoyISO} sugerencia={n.siguientePasoHubspot} />
      {senales.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {senales.map((s) => (
            <span key={s} className={cn(CHIP, "border-warn-line bg-warn-surface text-warn-ink")}>
              {TEXTO_DE_SENAL[s]}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {pregunta && <BotonBlanco onClick={() => onCompletar(n.id)}>Completar</BotonBlanco>}
        <BotonTexto onClick={() => onDefinir(pasoDelNegocio(n))}>{paso && !pasoVencido(n, hoyISO) ? "Cambiar el siguiente paso" : "Definir siguiente paso"}</BotonTexto>
        {n.hubspotUrl && (
          <a href={n.hubspotUrl} target="_blank" rel="noreferrer" className={ENLACE}>
            Abrir en HubSpot
          </a>
        )}
      </div>
    </article>
  );
}

const ultima = (n: NegocioVisto) => [n.ultimaActividad, n.ultimaReunion].filter(Boolean).sort().at(-1) ?? null;

const QUE_ES_LA_VISTA: Record<VistaDeCartera, string> = {
  mover: "Una fila por empresa, con lo más urgente de sus negocios.",
  pipeline: "Los negocios que se están vendiendo, sin los pausados.",
  limpiar: "Negocios pausados, con el cierre vencido y sin actividad, o sin empresa en HubSpot.",
  "sin-negocio": "Empresas tuyas sin ningún negocio abierto: para expandir o retomar.",
};

type FiltroDeTemperatura = "" | Temperatura;
type FiltroDeTipo = "" | "CLIENTE" | "PROSPECTO" | "SIN_FICHA";
type FiltroDeDueno = "" | "duenio" | "negocio";

function Cartera({
  vista,
  hoyISO,
  ahora,
  vistaActiva,
  onVista,
  onCompletar,
  onDefinir,
}: {
  vista: VistaDeVentas;
  hoyISO: string;
  ahora: Date;
  vistaActiva: VistaDeCartera;
  onVista: (v: VistaDeCartera) => void;
  onCompletar: (id: string) => void;
  onDefinir: (o: ObjetoParaElPaso) => void;
}) {
  const [texto, setTexto] = useState("");
  const [temperatura, setTemperatura] = useState<FiltroDeTemperatura>("");
  const [tipo, setTipo] = useState<FiltroDeTipo>("");
  const [pipeline, setPipeline] = useState("");
  const [dueno, setDueno] = useState<FiltroDeDueno>("");
  const urlDe = useMemo(() => new Map(vista.negocios.map((n) => [n.id, n.hubspotUrl])), [vista.negocios]);
  const pipelines = useMemo(() => [...new Set(vista.negocios.map((n) => n.pipeline))].sort(), [vista.negocios]);
  const hayFiltro = !!(texto.trim() || temperatura || tipo || pipeline || dueno);

  const empresas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const out: EmpresaDeCartera[] = [];
    for (const e of vista.empresas) {
      if (q && !e.nombre.toLowerCase().includes(q) && !e.negocios.some((n) => n.nombre.toLowerCase().includes(q))) continue;
      if (tipo === "SIN_FICHA" ? e.tipo !== null : tipo && e.tipo !== tipo) continue;
      if (dueno === "duenio" && !e.esDueno) continue;
      if (dueno === "negocio" && e.negocios.length === 0) continue;
      const negocios = e.negocios.filter(
        (n) => (!temperatura || temperaturaDelNegocio(n, hoyISO, ahora) === temperatura) && (!pipeline || n.pipeline === pipeline),
      );
      if ((temperatura || pipeline) && negocios.length === 0) continue;
      out.push(negocios.length === e.negocios.length ? e : { ...e, negocios });
    }
    return out;
  }, [vista.empresas, texto, tipo, dueno, temperatura, pipeline, hoyISO, ahora]);

  const v = useMemo(() => vistasDeCartera(empresas, hoyISO, ahora), [empresas, hoyISO, ahora]);
  const cuentas: Record<VistaDeCartera, number> = {
    mover: v.moverHoy.length,
    pipeline: v.pipeline.completos.length + v.pipeline.incompletos.length,
    limpiar: v.porLimpiar.length,
    "sin-negocio": v.sinNegocio.length,
  };

  return (
    <div className="space-y-4">
      <Segmentado
        etiqueta="Vista de la cartera"
        opciones={[
          { clave: "mover", etiqueta: "Para mover hoy", cuenta: cuentas.mover },
          { clave: "pipeline", etiqueta: "Pipeline", cuenta: cuentas.pipeline },
          { clave: "limpiar", etiqueta: "Por limpiar", cuenta: cuentas.limpiar },
          { clave: "sin-negocio", etiqueta: "Sin negocio", cuenta: cuentas["sin-negocio"] },
        ]}
        valor={vistaActiva}
        onCambio={onVista}
      />
      <p className="text-[13px] text-fg-muted">
        {QUE_ES_LA_VISTA[vistaActiva]} Tu cartera son {plural(vista.empresas.length, "empresa", "empresas")}: las de tus{" "}
        {plural(vista.negocios.length, "negocio abierto", "negocios abiertos")} y {vista.propias} de Nexus de las que eres dueño en HubSpot.
      </p>

      <SearchFilterBar search={{ value: texto, onChange: setTexto, placeholder: "Buscar empresa o negocio…" }}>
        <Select className={FILTRO} aria-label="Temperatura" value={temperatura} onChange={(e) => setTemperatura(e.target.value as FiltroDeTemperatura)}>
          <option value="">Toda temperatura</option>
          <option value="caliente">Calientes</option>
          <option value="en-movimiento">En movimiento</option>
          <option value="frio">Fríos</option>
        </Select>
        <Select className={FILTRO} aria-label="Tipo de empresa" value={tipo} onChange={(e) => setTipo(e.target.value as FiltroDeTipo)}>
          <option value="">Clientes y prospectos</option>
          <option value="CLIENTE">Solo clientes</option>
          <option value="PROSPECTO">Solo prospectos</option>
          <option value="SIN_FICHA">Sin ficha en Nexus</option>
        </Select>
        {pipelines.length > 1 && (
          <Select className={FILTRO} aria-label="Pipeline" value={pipeline} onChange={(e) => setPipeline(e.target.value)}>
            <option value="">Todos los pipelines</option>
            {pipelines.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        )}
        <Select className={FILTRO} aria-label="De quién" value={dueno} onChange={(e) => setDueno(e.target.value as FiltroDeDueno)}>
          <option value="">Todas tus empresas</option>
          <option value="duenio">Soy el dueño de la empresa</option>
          <option value="negocio">Tengo un negocio abierto</option>
        </Select>
        {hayFiltro && (
          <BotonTexto
            onClick={() => {
              setTexto("");
              setTemperatura("");
              setTipo("");
              setPipeline("");
              setDueno("");
            }}
          >
            Quitar filtros
          </BotonTexto>
        )}
      </SearchFilterBar>

      {vistaActiva === "mover" && (
        <Lista vacia="Ninguna cuenta pide algo hoy: tus negocios activos tienen fecha, monto, actividad reciente y siguiente paso.">
          {v.moverHoy.map((m) => (
            <Fila key={m.empresa.clave}>
              <Cabeza empresa={m.empresa} />
              <Linea>
                <span title={m.negocio.nombre}>{m.negocio.nombre}</span>
                <span className="text-fg-muted">
                  {" · "}
                  {m.accion.motivo}
                  {m.otros > 0 && ` · ${plural(m.otros, "negocio más pide algo", "negocios más piden algo")}`}
                </span>
                {m.accion.clave !== "definir" && <LineaDelPaso paso={pasoDeVentas(m.negocio)} hoyISO={hoyISO} />}
              </Linea>
              <div className="md:text-right">
                <Accion accion={m.accion} negocio={m.negocio} url={urlDe.get(m.negocio.id) ?? null} onCompletar={onCompletar} onDefinir={onDefinir} />
              </div>
            </Fila>
          ))}
        </Lista>
      )}

      {vistaActiva === "pipeline" && (
        <div className="space-y-4">
          <SeccionDePipeline titulo="Con fecha de cierre y monto" negocios={v.pipeline.completos} hoyISO={hoyISO} ahora={ahora} urlDe={urlDe} onCompletar={onCompletar} onDefinir={onDefinir} />
          <SeccionDePipeline titulo="Les falta la fecha de cierre o el monto" negocios={v.pipeline.incompletos} hoyISO={hoyISO} ahora={ahora} urlDe={urlDe} onCompletar={onCompletar} onDefinir={onDefinir} />
          {cuentas.pipeline === 0 && <Lista vacia="No tienes negocios activos con estos filtros.">{[]}</Lista>}
        </div>
      )}

      {vistaActiva === "limpiar" && (
        <Lista vacia="No hay nada por limpiar: ningún negocio pausado, vencido sin actividad o sin empresa.">
          {v.porLimpiar.map(({ negocio: n, motivo }) => (
            <Fila key={n.id}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="min-w-0 truncate text-sm font-semibold text-fg" title={n.nombre}>
                  {n.nombre}
                </span>
                {esPausado(n) && <span className={cn(CHIP, "border-line bg-surface-muted text-fg-muted")}>Pausado</span>}
              </div>
              <Linea>
                <NombreDeEmpresa nombre={n.empresa} clientId={n.clientId} />
                <span className="text-fg-muted">
                  {" · "}
                  {motivo} · {n.monto != null ? montoCorto(n.monto, n.moneda) : "sin monto"}
                </span>
              </Linea>
              <div className="md:text-right">
                {urlDe.get(n.id) && (
                  <a href={urlDe.get(n.id)!} target="_blank" rel="noreferrer" className={ENLACE}>
                    Revisar en HubSpot
                  </a>
                )}
              </div>
            </Fila>
          ))}
        </Lista>
      )}

      {vistaActiva === "sin-negocio" && (
        <Lista vacia="Todas tus empresas tienen un negocio abierto.">
          {v.sinNegocio.map((e) => (
            <Fila key={e.clave}>
              <Cabeza empresa={e} />
              <Linea>
                <span className="text-fg-muted">
                  {e.ultimaInteraccion ? `Última reunión ${hace(e.ultimaInteraccion, ahora).replace("actividad ", "")}` : "Sin reuniones en 6 meses"}
                  {e.tipo === "CLIENTE" ? " · cliente sin ningún negocio abierto: ¿hay algo para expandir?" : ""}
                </span>
                <LineaDelPaso paso={pasoDeVentas(e)} hoyISO={hoyISO} />
              </Linea>
              <div className="flex items-center gap-3 md:justify-end">
                {e.clientId && (
                  <Link href={`/clients/${e.clientId}`} className={ENLACE}>
                    Ver la ficha
                  </Link>
                )}
                {e.clientId && (
                  <BotonBlanco onClick={() => onDefinir({ objeto: "empresa", objetoId: e.clientId!, nombre: e.nombre, pasos: e.pasos ?? [] })}>
                    {pasoDeVentas(e) && !pasoVencido(e, hoyISO) ? "Cambiar siguiente paso" : "Definir siguiente paso"}
                  </BotonBlanco>
                )}
              </div>
            </Fila>
          ))}
        </Lista>
      )}
    </div>
  );
}

function SeccionDePipeline({
  titulo,
  negocios,
  hoyISO,
  ahora,
  urlDe,
  onCompletar,
  onDefinir,
}: {
  titulo: string;
  negocios: NegocioVisto[];
  hoyISO: string;
  ahora: Date;
  urlDe: Map<string, string | null>;
  onCompletar: (id: string) => void;
  onDefinir: (o: ObjetoParaElPaso) => void;
}) {
  if (negocios.length === 0) return null;
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex items-baseline gap-2.5 px-4 pb-2.5 pt-3.5">
        <h2 className="text-[15px] font-semibold text-fg">{titulo}</h2>
        <span className="text-xs text-fg-muted">{plural(negocios.length, "negocio", "negocios")}</span>
      </div>
      {negocios.map((n) => {
        const temp = temperaturaDelNegocio(n, hoyISO, ahora);
        const accion = accionDelNegocio(n, hoyISO, ahora);
        return (
          <div key={n.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-3">
            <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-fg" title={n.nombre}>
                  {n.nombre}
                </span>
                <span className={cn(CHIP, COLOR_DE_TEMPERATURA[temp])}>{TEXTO_DE_TEMPERATURA[temp]}</span>
              </div>
              <div className="text-xs text-fg-muted">
                <NombreDeEmpresa nombre={n.empresa} clientId={n.clientId} /> · {n.etapa}
                {n.probabilidad != null && ` · ${Math.round(n.probabilidad * 100)} %`} · {hace(ultima(n), ahora)}
              </div>
              <LineaDelPaso paso={pasoDeVentas(n)} hoyISO={hoyISO} sugerencia={n.siguientePasoHubspot} />
            </div>
            <div className="flex flex-none flex-col items-end gap-0.5 text-right">
              <span className="text-sm font-semibold tabular-nums text-fg">{n.monto != null ? montoCorto(n.monto, n.moneda) : "Sin monto"}</span>
              <span className="text-xs text-fg-muted">{textoDeCierre(n.fechaCierre, hoyISO)}</span>
            </div>
            <div className="flex-none">
              {accion ? (
                <Accion accion={accion} negocio={n} url={urlDe.get(n.id) ?? null} onCompletar={onCompletar} onDefinir={onDefinir} />
              ) : (
                urlDe.get(n.id) && (
                  <a href={urlDe.get(n.id)!} target="_blank" rel="noreferrer" className={ENLACE}>
                    Abrir en HubSpot
                  </a>
                )
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Lista({ vacia, children }: { vacia: string; children: React.ReactNode[] }) {
  if (children.length === 0) {
    return <div className="rounded-xl border border-dashed border-line bg-surface-muted p-5 text-center text-[13px] text-fg-muted">{vacia}</div>;
  }
  return <section className="overflow-hidden rounded-xl border border-line bg-surface">{children}</section>;
}

/** Una fila de la cartera: la empresa (y sus marcas), lo que pide, y la acción, en tres columnas que se apilan en un celular. */
function Fila({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-3 first:border-t-0 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_auto]">
      {children}
    </div>
  );
}

function Linea({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 text-[13px] leading-5 text-fg-secondary">{children}</div>;
}

function Cabeza({ empresa: e }: { empresa: EmpresaDeCartera }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <NombreDeEmpresa nombre={e.nombre} clientId={e.clientId} className="min-w-0 truncate text-sm font-semibold text-fg" />
      <ChipDeTipo tipo={e.tipo} />
      {e.temperatura && <span className={cn(CHIP, COLOR_DE_TEMPERATURA[e.temperatura])}>{TEXTO_DE_TEMPERATURA[e.temperatura]}</span>}
    </div>
  );
}

/**
 * El botón de la acción: «Completar» abre la pregunta acá, «Definir siguiente paso» abre su diálogo, «Preparar» lleva a
 * la ficha; lo demás, al negocio en HubSpot.
 */
function Accion({
  accion,
  negocio: n,
  url,
  onCompletar,
  onDefinir,
}: {
  accion: AccionDelNegocio;
  negocio: NegocioVisto;
  url: string | null;
  onCompletar: (id: string) => void;
  onDefinir: (o: ObjetoParaElPaso) => void;
}) {
  if (accion.clave === "completar") return <BotonBlanco onClick={() => onCompletar(n.id)}>{accion.boton}</BotonBlanco>;
  if (accion.clave === "definir") return <BotonBlanco onClick={() => onDefinir(pasoDelNegocio(n))}>{accion.boton}</BotonBlanco>;
  const href = accion.clave === "preparar" && n.clientId ? `/clients/${n.clientId}` : url;
  if (!href) return null;
  const externo = href.startsWith("http");
  return externo ? (
    <a href={href} target="_blank" rel="noreferrer" className="flex-none rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg">
      {accion.boton}
    </a>
  ) : (
    <Link href={href} className="flex-none rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg">
      {accion.boton}
    </Link>
  );
}

function PreguntaDelNegocio({
  negocio: n,
  hoyISO,
  ahora,
  onCerrar,
}: {
  negocio: Negocio;
  hoyISO: string;
  ahora: Date;
  onCerrar: (cambio: boolean) => void;
}) {
  const toast = useToast();
  const p = preguntaDelNegocio(n, hoyISO, ahora) ?? { fecha: !n.fechaCierre, monto: n.monto === null, vencida: false };
  const [fecha, setFecha] = useState(p.fecha ? "" : (n.fechaCierre ?? ""));
  const [monto, setMonto] = useState(n.monto != null ? String(n.monto) : "");
  const [guardando, setGuardando] = useState(false);
  const [propuesta, setPropuesta] = useState<PropuestaDeCierre | null>(n.propuesta);
  const [leyendo, setLeyendo] = useState(true);

  // Al abrir, Nexus lee lo que se habló con la empresa y propone (la guardada sirve 24 h: el servidor decide).
  useEffect(() => {
    let vivo = true;
    fetchJson<{ propuesta: PropuestaDeCierre | null }>(`/api/sales/negocios/${encodeURIComponent(n.id)}/propuesta`, { method: "POST" })
      .then((r) => vivo && setPropuesta(r.propuesta))
      .catch(() => {})
      .finally(() => vivo && setLeyendo(false));
    return () => {
      vivo = false;
    };
  }, [n.id]);

  const guardar = async () => {
    const body: { fechaCierre?: string; monto?: number } = {};
    if (fecha && fecha !== n.fechaCierre) body.fechaCierre = fecha;
    const m = Number(monto.replace(/[^\d.]/g, ""));
    if (monto.trim() && Number.isFinite(m) && m > 0 && m !== n.monto) body.monto = m;
    if (!body.fechaCierre && body.monto === undefined) {
      toast.error("Escribe la fecha de cierre o el monto.");
      return;
    }
    if (body.fechaCierre && diasHasta(body.fechaCierre, hoyISO) < 0) {
      toast.error("La fecha de cierre no puede ser anterior a hoy.");
      return;
    }
    setGuardando(true);
    try {
      await fetchJson(`/api/sales/negocios/${encodeURIComponent(n.id)}/respuesta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success("Quedó guardado en HubSpot.");
      onCerrar(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar en HubSpot.");
      setGuardando(false);
    }
  };

  const posponer = async () => {
    setGuardando(true);
    try {
      await fetchJson(`/api/sales/negocios/${encodeURIComponent(n.id)}/posponer`, { method: "POST" });
      onCerrar(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo posponer.");
      setGuardando(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => onCerrar(false)}
      title={n.nombre}
      description={`${n.empresa} · ${n.etapa}`}
      size="md"
      footer={
        <div className="flex w-full items-center gap-2">
          <BotonTexto onClick={posponer} disabled={guardando} title="No se vuelve a preguntar en 7 días">
            Ahora no
          </BotonTexto>
          <span className="ml-auto" />
          <BotonBlanco onClick={() => onCerrar(false)} disabled={guardando}>
            Cancelar
          </BotonBlanco>
          <BotonAzul onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar en HubSpot"}
          </BotonAzul>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-fg-secondary">
          {p.vencida && n.fechaCierre
            ? `La fecha de cierre que tiene (${fechaCorta(n.fechaCierre)}) ya pasó.`
            : p.fecha && p.monto
              ? "Le faltan la fecha de cierre y el monto."
              : p.fecha
                ? "Le falta la fecha de cierre."
                : "Le falta el monto."}{" "}
          Lo que pongas se guarda en el negocio de HubSpot.
        </p>

        {leyendo && !(propuesta?.fechaCierre || propuesta?.monto) && (
          <div className="flex items-center gap-1.5 rounded-lg border border-info-line bg-info-surface p-3 text-xs text-brand">
            <IconoDeSugerencia className="h-[13px] w-[13px]" />
            Nexus está leyendo lo que se habló con {n.empresa}…
          </div>
        )}
        {!leyendo && propuesta && !propuesta.fechaCierre && !propuesta.monto && (
          <p className="text-xs text-fg-muted">Nexus no encontró en las reuniones ni en HubSpot una fecha o un monto dichos para este negocio.</p>
        )}
        {propuesta && (propuesta.fechaCierre || propuesta.monto) && (
          <div className="space-y-2 rounded-lg border border-info-line bg-info-surface p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand">
              <IconoDeSugerencia className="h-[13px] w-[13px]" />
              Nexus propone
            </div>
            {propuesta.fechaCierre && (
              <Propuesto
                etiqueta={`Cierre: ${fechaCorta(propuesta.fechaCierre.valor)}`}
                cita={propuesta.fechaCierre.cita}
                fuente={propuesta.fechaCierre.fuente}
                onUsar={() => setFecha(propuesta.fechaCierre!.valor)}
              />
            )}
            {propuesta.monto && (
              <Propuesto
                etiqueta={`Monto: ${montoCorto(propuesta.monto.valor, propuesta.monto.moneda)}`}
                cita={propuesta.monto.cita}
                fuente={propuesta.monto.fuente}
                onUsar={() => setMonto(String(propuesta.monto!.valor))}
              />
            )}
          </div>
        )}

        <Field label="Fecha de cierre">
          <Input type="date" value={fecha} min={hoyISO} onChange={(ev) => setFecha(ev.target.value)} />
        </Field>
        <Field label={`Monto (${n.moneda})`}>
          <Input inputMode="decimal" value={monto} placeholder="Ej.: 4500" onChange={(ev) => setMonto(ev.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function Propuesto({ etiqueta, cita, fuente, onUsar }: { etiqueta: string; cita: string; fuente: string; onUsar: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-fg">{etiqueta}</div>
        <div className="text-xs leading-[17px] text-fg-muted">
          «{cita}» · {fuente}
        </div>
      </div>
      <BotonBlanco onClick={onUsar}>Usar</BotonBlanco>
    </div>
  );
}
