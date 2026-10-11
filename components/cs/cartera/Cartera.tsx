"use client";

/**
 * «Cartera» — todas las cuentas con su color, su clasificación y su relación con HubSpot (2026-10-07,
 * docs/exito-del-cliente-cartera-plan.md, entregas 1 a 4). Reemplaza al filtro «Toda la cartera» de «A quién
 * llamar».
 *
 * Nexus propone cada dato de la clasificación con lo que sabe de la cuenta (`lib/cs/clasificacion.ts`) y la CSL lo
 * confirma o lo cambia. La propuesta se ve una vez, en su celda, en azul con la chispa; arriba, una franja dice
 * cuántas esperan y deja usar todas las de las cuentas que se ven. Lo confirmado no se pinta de verde ni se mueve.
 *
 * Los filtros (varios valores a la vez) viven en la dirección: una vista es un enlace (entrega 3). Arriba, las
 * vistas de arranque y las guardadas, compartidas entre la CSL y dirección. La columna HubSpot dice si Smarteam
 * gestiona la cuenta en HubSpot y cuándo vence (2026-10-09): sin esa relación se pierden el uso y los puntos.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, EmptyState, Field, Input, Modal, Segmentado, Select } from "@/components/ui";
import { BotonAzul, FranjaDeSugerencias, IconoDeSugerencia } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { fmtDia, plural } from "@/lib/cs/formato";
import { COLORES_EN_ORDEN, NOMBRE_DE_LA_SALUD, RANGO_DE_LA_SALUD } from "@/lib/cs/cartera-reglas";
import {
  MOMENTOS,
  POTENCIALES,
  RELACIONES,
  pendientesDeConfirmar,
  type ClasificacionGuardada,
  type DatoDeClasificacion,
  type FilaDeLaCartera,
  type OperacionDeClasificacion,
} from "@/lib/cs/clasificacion";
import { ESTADOS_DE_RELACION, REGLA_DE_LA_RELACION } from "@/lib/cs/relacion-gestionada";
import {
  FILTROS_VACIOS,
  SIN_CSE,
  VENTANAS_DE_RENOVACION,
  VISTAS_DE_ARRANQUE,
  cuantasPor,
  enElAlcance,
  filasQuePasan,
  filtrosParaGuardar,
  hayFiltros,
  mismosFiltros,
  type AlcanceDeCartera,
  type FiltrosDeCartera,
} from "@/lib/cs/filtros-de-cartera";
import type { VistaGuardada } from "@/lib/cs/vistas-de-cartera-server";
import { InfoHint } from "@/components/ui/Tooltip";
import { Avatar, CajaDeTabla, EncabezadoDeTabla, META_DE_SALUD, Punto, Salud } from "../piezas";
import { CeldaDeClasificacion, conLoGuardado, guardarClasificacion, operacionesParaUsarTodo } from "../CeldaDeClasificacion";
import { CorregirColor } from "../AjusteDelColor";
import { CampoDeBusqueda } from "./Buscar";
import FiltroMultiple from "./FiltroMultiple";
import CseEncargadoSelect, { type OpcionDeEncargado } from "@/components/clients/CseEncargadoSelect";

const COLUMNAS = "grid-cols-[150px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_150px_88px]";

/** El orden de las columnas de la clasificación (el CSE va aparte: se cambia con el pase de cuenta). */
const COLUMNAS_DE_CLASIFICACION: DatoDeClasificacion[] = ["relacion", "momento", "potencial"];

const PUNTO_DE_LA_RELACION = { verde: "verde", ambar: "ambar", gris: "gris" } as const;

export default function Cartera({
  filas: filasDelServidor,
  cses,
  hoy,
  puedeEditar,
  puedeCorregir,
  filtros,
  onFiltros,
  vistas: vistasDelServidor,
  vistasListas,
  yo,
  equipoParaPase,
  puedeReasignar,
}: {
  filas: readonly FilaDeLaCartera[];
  /** Los CSE que llevan algún cliente, para el filtro. */
  cses: string[];
  hoy: string;
  /** false = falta el SQL de la clasificación: se ven las propuestas, no se confirman. */
  puedeEditar: boolean;
  /** false = falta el SQL de las correcciones del color. */
  puedeCorregir: boolean;
  filtros: FiltrosDeCartera;
  onFiltros: (f: FiltrosDeCartera) => void;
  vistas: readonly VistaGuardada[];
  vistasListas: boolean;
  /** El correo de quien mira: borra solo las vistas que creó. */
  yo: string | null;
  /** A quién se le puede pasar una cuenta (el pase escribe «CSE Encargado» en HubSpot). */
  equipoParaPase: OpcionDeEncargado[];
  puedeReasignar: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [usandoTodo, setUsandoTodo] = useState(false);
  // Lo guardado acá, por cuenta: la propuesta no cambia al guardar, lo confirmado sí (no hace falta pedir la cartera).
  const [guardadas, setGuardadas] = useState<ReadonlyMap<string, ClasificacionGuardada>>(new Map());
  const [vistas, setVistas] = useState<readonly VistaGuardada[]>(vistasDelServidor);
  const [guardando, setGuardando] = useState(false);
  const [guardarVista, setGuardarVista] = useState(false);
  const [nombreDeLaVista, setNombreDeLaVista] = useState("");

  const filas = useMemo(
    () =>
      filasDelServidor.map((f) => {
        const g = guardadas.get(f.clientId);
        return g ? { ...f, clasificacion: conLoGuardado(f.clasificacion, g) } : f;
      }),
    [filasDelServidor, guardadas],
  );
  const guardar = (clientId: string, g: ClasificacionGuardada) => setGuardadas((m) => new Map(m).set(clientId, g));
  const poner = (cambios: Partial<FiltrosDeCartera>) => onFiltros({ ...filtros, ...cambios });

  const delAlcance = useMemo(() => filas.filter((f) => enElAlcance(f, filtros.alcance)), [filas, filtros.alcance]);
  const visibles = useMemo(
    () =>
      filasQuePasan(filas, filtros, hoy, (f) => pendientesDeConfirmar(f.clasificacion)).sort(
        (a, b) => RANGO_DE_LA_SALUD[a.salud] - RANGO_DE_LA_SALUD[b.salud] || a.nombre.localeCompare(b.nombre, "es"),
      ),
    [filas, filtros, hoy],
  );
  const conPropuestas = visibles.filter((f) => pendientesDeConfirmar(f.clasificacion) > 0);
  const propuestasALaVista = conPropuestas.reduce((n, f) => n + pendientesDeConfirmar(f.clasificacion), 0);
  const csesOrdenados = useMemo(() => [...cses].sort((a, b) => a.localeCompare(b, "es")), [cses]);
  const cuantas = {
    cartera: filas.filter((f) => f.enCartera).length,
    fuera: filas.filter((f) => !f.enCartera).length,
    todas: filas.length,
  };
  const vistaActual =
    [...VISTAS_DE_ARRANQUE.map((v) => ({ id: v.id, filtros: v.filtros })), ...vistas.map((v) => ({ id: v.id, filtros: v.filtros }))].find((v) =>
      mismosFiltros(v.filtros, filtros),
    )?.id ?? null;

  async function usarTodo() {
    const cuentas = conPropuestas.map((f) => ({ clientId: f.clientId, operaciones: operacionesParaUsarTodo(f.clasificacion) }));
    if (cuentas.length === 0) return;
    setUsandoTodo(true);
    const aplicar = (g: Record<string, ClasificacionGuardada>) =>
      setGuardadas((m) => {
        const n = new Map(m);
        for (const [id, x] of Object.entries(g)) n.set(id, x);
        return n;
      });
    try {
      const r = await fetchJson<{ guardadas: Record<string, ClasificacionGuardada> }>("/api/cs/clasificacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuentas }),
      });
      aplicar(r.guardadas);
      toast.success(`Listo: ${plural(Object.keys(r.guardadas).length, "cuenta confirmada", "cuentas confirmadas")}.`);
    } catch (e) {
      // Si se cortó a mitad, lo que alcanzó a guardarse viene en la respuesta y se pinta igual.
      const parcial = e instanceof ApiError ? (e.payload as { guardadas?: Record<string, ClasificacionGuardada> } | null)?.guardadas : undefined;
      if (parcial) aplicar(parcial);
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setUsandoTodo(false);
    }
  }

  async function guardarLaVista() {
    setGuardando(true);
    try {
      const r = await fetchJson<{ vista: VistaGuardada }>("/api/cs/vistas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreDeLaVista.trim(), filtros: filtrosParaGuardar(filtros) }),
      });
      setVistas((vs) => [...vs, r.vista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      toast.success(`Vista «${r.vista.nombre}» guardada. La ve todo quien entra a Éxito del cliente.`);
      setNombreDeLaVista("");
      setGuardarVista(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la vista.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrarLaVista(v: VistaGuardada) {
    try {
      await fetchJson(`/api/cs/vistas/${v.id}`, { method: "DELETE" });
      setVistas((vs) => vs.filter((x) => x.id !== v.id));
      toast.success(`Vista «${v.nombre}» borrada.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar la vista.");
    }
  }

  const abrirLaPrimera = () => {
    if (filtros.q.trim() && visibles[0]) router.push(`/customer-success/${visibles[0].clientId}`);
  };

  const opcionesDe = (lista: "color" | "hubspot" | "relacion" | "momento" | "potencial" | "cse", valores: ReadonlyArray<{ clave: string; nombre: string }>) =>
    valores.map((v) => ({ ...v, cuenta: cuantasPor(delAlcance, lista, v.clave) }));

  return (
    <div className="space-y-3" data-recorrido="cs.clasificar">
      {!puedeEditar && (
        <Alert variant="info">
          Falta aplicar el SQL de la clasificación en la base: se ven las propuestas de Nexus, pero todavía no se pueden
          confirmar.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2" data-recorrido="cs.vistas">
        <span className="text-xs text-fg-muted">Vistas:</span>
        {VISTAS_DE_ARRANQUE.map((v) => (
          <ChipDeVista key={v.id} activa={vistaActual === v.id} titulo={v.para} onClick={() => onFiltros(v.filtros)}>
            {v.nombre}
          </ChipDeVista>
        ))}
        {vistas.map((v) => (
          <ChipDeVista
            key={v.id}
            activa={vistaActual === v.id}
            titulo={`Guardada por ${v.creadaPorNombre ?? v.creadaPorEmail}`}
            onClick={() => onFiltros(v.filtros)}
            onBorrar={yo && v.creadaPorEmail.toLowerCase() === yo.toLowerCase() ? () => void borrarLaVista(v) : undefined}
          >
            {v.nombre}
          </ChipDeVista>
        ))}
        {hayFiltros(filtros) && !vistaActual && vistasListas && (
          <button
            type="button"
            onClick={() => setGuardarVista(true)}
            className="text-xs font-semibold text-brand transition-colors hover:text-brand-light"
          >
            Guardar estos filtros como vista
          </button>
        )}
        {hayFiltros(filtros) && (
          <button type="button" onClick={() => onFiltros({ ...FILTROS_VACIOS })} className="text-xs text-fg-muted transition-colors hover:text-fg">
            Quitar los filtros
          </button>
        )}
      </div>

      {puedeEditar && propuestasALaVista > 0 && (
        <FranjaDeSugerencias
          acciones={
            <BotonAzul onClick={() => void usarTodo()} disabled={usandoTodo}>
              {usandoTodo ? "Guardando…" : `Usar las de ${plural(conPropuestas.length, "cuenta", "cuentas")}`}
            </BotonAzul>
          }
        >
          Nexus propone {plural(propuestasALaVista, "dato", "datos")} de {plural(conPropuestas.length, "cuenta que ves", "cuentas que ves")}.
          Revísalos en su celda (el porqué, al pasar el mouse) o úsalos todos.
        </FranjaDeSugerencias>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado<AlcanceDeCartera>
            etiqueta="Qué cuentas"
            valor={filtros.alcance}
            onCambio={(alcance) => poner({ alcance })}
            opciones={[
              { clave: "cartera", etiqueta: "En la cartera", cuenta: cuantas.cartera },
              { clave: "fuera", etiqueta: "Fuera de la cartera", cuenta: cuantas.fuera },
              { clave: "todas", etiqueta: "Todos los clientes", cuenta: cuantas.todas },
            ]}
          />
          <Interruptor activo={filtros.porConfirmar} onClick={() => poner({ porConfirmar: !filtros.porConfirmar })}>
            Por confirmar
            <b className="font-semibold tabular-nums">{delAlcance.filter((f) => pendientesDeConfirmar(f.clasificacion) > 0).length}</b>
          </Interruptor>
        </div>
        <CampoDeBusqueda valor={filtros.q} onCambio={(q) => poner({ q })} onEnter={abrirLaPrimera} />
      </div>

      <div className="flex flex-wrap items-center gap-2" data-recorrido="cs.filtros">
        <FiltroMultiple
          nombre="Color"
          valor={filtros.color}
          onCambio={(color) => poner({ color: color as FiltrosDeCartera["color"] })}
          opciones={opcionesDe("color", COLORES_EN_ORDEN.map((c) => ({ clave: c, nombre: NOMBRE_DE_LA_SALUD[c] })))}
        />
        <FiltroMultiple
          nombre="HubSpot"
          valor={filtros.hubspot}
          onCambio={(hubspot) => poner({ hubspot: hubspot as FiltrosDeCartera["hubspot"] })}
          opciones={opcionesDe("hubspot", ESTADOS_DE_RELACION)}
        />
        <FiltroMultiple nombre="Tipo de relación" valor={filtros.relacion} onCambio={(relacion) => poner({ relacion })} opciones={opcionesDe("relacion", RELACIONES)} />
        <FiltroMultiple nombre="Momento" valor={filtros.momento} onCambio={(momento) => poner({ momento })} opciones={opcionesDe("momento", MOMENTOS)} />
        <FiltroMultiple nombre="Potencial" valor={filtros.potencial} onCambio={(potencial) => poner({ potencial })} opciones={opcionesDe("potencial", POTENCIALES)} />
        {csesOrdenados.length > 0 && (
          <FiltroMultiple
            nombre="CSE"
            valor={filtros.cse}
            onCambio={(cse) => poner({ cse })}
            opciones={opcionesDe("cse", [...csesOrdenados.map((n) => ({ clave: n, nombre: n })), { clave: SIN_CSE, nombre: "Sin CSE" }])}
          />
        )}
        <Select
          aria-label="Renueva"
          value={filtros.renueva === null ? "" : String(filtros.renueva)}
          onChange={(e) => poner({ renueva: e.target.value ? Number(e.target.value) : null })}
          className="w-auto"
        >
          <option value="">Renueva: cuando sea</option>
          {VENTANAS_DE_RENOVACION.map((d) => (
            <option key={d} value={d}>
              Renueva en {d} días o menos
            </option>
          ))}
        </Select>
        <Interruptor activo={filtros.sinContacto} onClick={() => poner({ sinContacto: !filtros.sinContacto })}>
          Sin contacto
        </Interruptor>
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-secondary">
        <span className="text-fg-muted">{plural(visibles.length, "cuenta", "cuentas")}:</span>
        {COLORES_EN_ORDEN.map((s) => {
          const n = visibles.filter((f) => f.salud === s).length;
          return n === 0 ? null : (
            <span key={s} className="inline-flex items-center gap-1.5">
              <Punto color={META_DE_SALUD[s].color} />
              <b className="font-semibold tabular-nums text-fg">{n}</b> {NOMBRE_DE_LA_SALUD[s].toLowerCase()}
            </span>
          );
        })}
      </p>

      {visibles.length === 0 ? (
        <EmptyState
          title={filtros.porConfirmar ? "Nada por confirmar" : "Ninguna cuenta coincide"}
          description={filtros.porConfirmar ? "Lo que propone Nexus en estas cuentas ya está confirmado o descartado." : "Prueba con otros filtros o quítalos."}
        />
      ) : (
        <CajaDeTabla minimo="min-w-[1320px]">
          <EncabezadoDeTabla columnas={COLUMNAS}>
            <span>Color</span>
            <span>Cuenta</span>
            <span>Tipo de relación</span>
            <span>Momento</span>
            <span>Potencial</span>
            <span className="flex items-center gap-1">
              HubSpot <InfoHint text={REGLA_DE_LA_RELACION} />
            </span>
            <span>CSE</span>
            <span>Renueva</span>
          </EncabezadoDeTabla>
          {visibles.map((f, i) => (
            <FilaDeCartera
              key={f.clientId}
              fila={f}
              primera={i === 0}
              hoy={hoy}
              puedeEditar={puedeEditar}
              puedeCorregir={puedeCorregir}
              equipoParaPase={equipoParaPase}
              puedeReasignar={puedeReasignar}
              onGuardada={(g) => guardar(f.clientId, g)}
            />
          ))}
        </CajaDeTabla>
      )}
      <p className="text-xs text-fg-muted">
        Nexus propone el tipo de relación, el momento y el potencial con lo que sabe de cada cuenta; en azul, lo que todavía
        no confirmaste. Si la cuenta cambia, vuelve a proponer. El CSE es quien lleva más proyectos en la cuenta y se cambia
        con el pase de cuenta.
      </p>

      <Modal
        open={guardarVista}
        onClose={() => setGuardarVista(false)}
        title="Guardar estos filtros como vista"
        description="La ven la CSL y dirección; solo tú la puedes borrar. La búsqueda por nombre no se guarda."
        size="sm"
        footer={
          <BotonAzul disabled={guardando || nombreDeLaVista.trim().length < 2} onClick={() => void guardarLaVista()}>
            {guardando ? "Guardando…" : "Guardar"}
          </BotonAzul>
        }
      >
        <Field label="Nombre de la vista">
          <Input value={nombreDeLaVista} onChange={(e) => setNombreDeLaVista(e.target.value.slice(0, 60))} placeholder="Ej.: Recurrentes de Ana en riesgo" />
        </Field>
      </Modal>
    </div>
  );
}

function ChipDeVista({
  children,
  activa,
  titulo,
  onClick,
  onBorrar,
}: {
  children: React.ReactNode;
  activa: boolean;
  titulo: string;
  onClick: () => void;
  onBorrar?: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border text-xs transition-colors",
        activa ? "border-info-line bg-info-surface text-brand" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
      )}
    >
      <button type="button" onClick={onClick} title={titulo} aria-pressed={activa} className={cn("py-1 pl-2.5", onBorrar ? "pr-0.5" : "pr-2.5", activa && "font-semibold")}>
        {children}
      </button>
      {onBorrar && (
        <button type="button" onClick={onBorrar} title="Borrar esta vista" aria-label="Borrar esta vista" className="py-1 pr-2 text-fg-muted hover:text-fg">
          ✕
        </button>
      )}
    </span>
  );
}

function Interruptor({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors",
        activo ? "border-info-line bg-info-surface text-brand" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
      )}
    >
      {children}
    </button>
  );
}

function FilaDeCartera({
  fila: f,
  primera,
  hoy,
  puedeEditar,
  puedeCorregir,
  equipoParaPase,
  puedeReasignar,
  onGuardada,
}: {
  fila: FilaDeLaCartera;
  primera: boolean;
  hoy: string;
  puedeEditar: boolean;
  puedeCorregir: boolean;
  equipoParaPase: OpcionDeEncargado[];
  puedeReasignar: boolean;
  onGuardada: (g: ClasificacionGuardada) => void;
}) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const pendientes = pendientesDeConfirmar(f.clasificacion);

  async function usarLas(ops: OperacionDeClasificacion[]) {
    setOcupado(true);
    try {
      onGuardada(await guardarClasificacion(f.clientId, ops));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  const r = f.relacion;
  return (
    <div className={cn("grid items-start gap-4 px-4 py-3 text-fg", COLUMNAS, !primera && "border-t border-line")}>
      <span className="flex flex-col items-start gap-0.5 pt-0.5">
        <Salud salud={f.salud} porque={f.porqueDeLaSalud} />
        {f.correccion && (
          <span className="text-[11px] text-fg-muted" title={`«${f.correccion.nota}» · vale hasta el ${fmtDia(f.correccion.vence, hoy)}`}>
            corregido por {f.correccion.quien}
            {f.nexusDiria && f.nexusDiria !== f.salud ? ` · Nexus: ${NOMBRE_DE_LA_SALUD[f.nexusDiria].toLowerCase()}` : ""}
          </span>
        )}
        {f.esperaPropuesta && (
          <Link
            href={`/customer-success/${f.clientId}`}
            title={f.esperaPropuesta.nota}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:text-brand-light"
          >
            <IconoDeSugerencia className="h-3 w-3" />
            ¿En espera del cliente?
          </Link>
        )}
        {puedeCorregir && (
          <CorregirColor
            clientId={f.clientId}
            cuenta={f.nombre}
            salud={f.salud}
            nexus={f.nexusDiria}
            correccion={f.correccion}
            hoy={hoy}
            compacto
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <Link href={`/customer-success/${f.clientId}`} className="truncate text-sm font-semibold hover:text-brand">
          {f.nombre}
        </Link>
        {f.espera && (
          <span className="truncate text-xs text-fg-secondary" title={`Lo marcó ${f.espera.quien}`}>
            Espera: {f.espera.nota}
          </span>
        )}
        {puedeEditar && pendientes > 1 && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void usarLas(operacionesParaUsarTodo(f.clasificacion))}
            className="self-start text-xs font-semibold text-brand transition-colors hover:text-brand-light disabled:opacity-50"
          >
            {ocupado ? "Guardando…" : `Usar las ${pendientes} propuestas`}
          </button>
        )}
      </span>
      {COLUMNAS_DE_CLASIFICACION.map((dato) => (
        <CeldaDeClasificacion
          key={dato}
          clientId={f.clientId}
          cuenta={f.nombre}
          dato={dato}
          estado={f.clasificacion[dato]}
          puedeEditar={puedeEditar}
          onGuardada={onGuardada}
          hoy={hoy}
        />
      ))}
      <span className="flex min-w-0 items-start gap-1.5 pt-0.5 text-[13px]" title={[r.porque, r.queHacer].filter(Boolean).join(" ")}>
        <Punto color={PUNTO_DE_LA_RELACION[r.tono]} className="mt-1.5" />
        <span className={cn("min-w-0", r.tono === "ambar" ? "text-warn-ink" : r.tono === "verde" ? "text-fg" : "text-fg-muted")}>{r.corto}</span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <Avatar nombre={f.cse?.nombre ?? null} title={f.cse ? `CSE: ${f.cse.nombre}` : "Sin CSE"} />
        {/* El pase de cuenta: la misma celda del listado de clientes (escribe «CSE Encargado» en HubSpot). */}
        {f.proyectosActivos > 0 ? (
          <CseEncargadoSelect
            clientId={f.clientId}
            clientName={f.nombre}
            nombres={f.cses}
            opciones={puedeReasignar ? equipoParaPase : []}
            puedeEditar={puedeReasignar}
          />
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </span>
      <span className={cn("pt-0.5 text-[13px]", f.renueva ? "text-fg" : "text-fg-muted")}>{f.renueva ? fmtDia(f.renueva, hoy) : "—"}</span>
    </div>
  );
}
