"use client";

import { useCallback, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  Tabs,
  EmptyState,
  Menu,
  ConfirmDialog,
  Segmentado,
  type TableColumn,
} from "@/components/ui";
import { BotonBlanco } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import CseEncargadoSelect, { type OpcionDeEncargado } from "@/components/clients/CseEncargadoSelect";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { CLIENT_KINDS, CLIENT_KIND_META, formatTamUsd } from "@/lib/clients/kind";
import { filtrarPorBusqueda } from "@/lib/ui/text-search";
import { cn } from "@/lib/cn";
import type { EtapaDeFila } from "@/lib/clients/indice";
import {
  tituloDeProyectos,
  type ResumenDeProyectos,
} from "@/lib/clients/resumen-proyectos";
import {
  VISTA_POR_DEFECTO,
  aplicarVista,
  contarConPlural,
  contarVistas,
  describirVista,
  explicarListaVacia,
  vistasARenderizar,
  type AccionDeVacio,
  type Pertenencia,
  type VistaDeCartera,
} from "@/lib/clients/filtro-cartera";
import {
  COPY_PROYECTOS_INTERNOS,
  textoBuscableDe,
  type ProyectoInternoRow,
} from "@/lib/clients/proyectos-internos";
import type { ClientKind } from "@prisma/client";

/**
 * ClientsGrid — la columna izquierda del índice de clientes (rediseño del 2026-10-04, sistema
 * «Nexus · interfaz interna», como el listado de la preventa): las categorías en pestañas
 * subrayadas, «De quién es» y «Qué tiene» como segmentados, el buscador a la derecha, y la tabla
 * de seis columnas — la empresa con sus proyectos abiertos debajo, la etapa con su barra, el CSE,
 * la última actividad con su fuente, la próxima reunión y el TAM.
 *
 * «Reunión ventas» y «Sesión CSE» dejaron de ser columnas: viven en el `title` de «Última
 * actividad» (y en la ficha). Eliminar pasó a un menú «⋯», solo para quien puede hacerlo.
 */

// Shape mínimo del usuario activo para el filtro "Mis clientes".
// Antes venía del tipo ActiveCse de lib/auth (basado en cookie nexus_cse);
// ahora viene de Supabase Auth + AppUser en el server component.
// Exportado: ClientsTable (la zona suspendida de /clients) lo recibe de page.tsx.
export interface ActiveCse {
  email: string;
  name: string;
  role: string;
  isSuperAdmin: boolean;
  canSeeAll: boolean; // roles que ven todos los clientes (VENTAS/CSL/MARKETING/SUPER_ADMIN)
}

export interface ClientRow {
  id: string;
  name: string;
  company: string | null;
  createdAt: string;            // ISO
  cseNames: string[];           // owners distintos de los proyectos
  cseEmails: string[];          // owners en email para matching contra activeCse
  lastSalesMeeting: string | null; // ISO
  lastCseMeeting: string | null;   // ISO
  // Última actividad PASADA — orden principal de la lista
  lastActivityAt: string | null;
  lastActivitySource: "session_past" | "note" | "agent_run" | null;
  lastActivityLabel: string | null;
  // Próxima reunión FUTURA agendada (columna separada)
  nextMeetingAt: string | null;
  nextMeetingLabel: string | null;
  /** Qué TIENE la empresa: 3 escalares. Alimenta la barra de filtros y el `title` de la línea de proyectos. */
  resumen: ResumenDeProyectos;
  /** Los nombres de los proyectos abiertos (mismo criterio que `resumen.abiertos`), en orden. */
  proyectosAbiertos: string[];
  /** La etapa del proyecto de implementación; con 2+, la del que va más atrás. */
  etapa: EtapaDeFila | null;
  isShared: boolean;            // compartido con el usuario actual (GRANT a él o a su rol)
  kind: ClientKind;             // qué ES la empresa (cliente/prospecto/aliado/interno)
  tamUsd: number | null;        // techo anual estimado en USD; null = Ventas no lo estimó
}

/* Las fechas del listado se arman a mano, en la hora de Costa Rica (UTC-6, sin horario de verano):
   el servidor y el navegador tienen que escribir EXACTAMENTE el mismo texto o React marca error de
   hidratación. Intl no lo garantiza —Node y Chrome traen datos de idioma distintos (espacios finos
   antes de «p. m.», «sept» contra «sep»)— y la zona local tampoco: el contenedor de producción
   corre en UTC. Por eso ni `toLocale*` ni `calendarDaysFromToday` (que usa la zona local). */
const DESFASE_CR_MS = 6 * 3_600_000;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** La fecha corrida a Costa Rica: se lee SOLO con los `getUTC*`. */
const enCR = (d: Date) => new Date(d.getTime() - DESFASE_CR_MS);
const medianocheCR = (d: Date) => {
  const c = enCR(d);
  return Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate());
};
/** Días de calendario de Costa Rica entre hoy y `d`: >0 futuro, <0 pasado, 0 hoy. */
const diasDesdeHoyCR = (d: Date) => Math.round((medianocheCR(d) - medianocheCR(new Date())) / 86_400_000);
const dosDigitos = (n: number) => String(n).padStart(2, "0");
/** «26 sept». */
const diaCorto = (d: Date) => {
  const c = enCR(d);
  return `${c.getUTCDate()} ${MESES_CORTOS[c.getUTCMonth()]}`;
};
/** «jue 8 oct». */
const diaConSemana = (iso: string) => `${DIAS_CORTOS[enCR(new Date(iso)).getUTCDay()]} ${diaCorto(new Date(iso))}`;
/** «10:00». */
function horaCR(iso: string): string {
  const c = enCR(new Date(iso));
  return `${dosDigitos(c.getUTCHours())}:${dosDigitos(c.getUTCMinutes())}`;
}
/** «3 oct 2026, 14:05». */
const fechaYHoraCR = (iso: string) => `${diaCorto(new Date(iso))} ${enCR(new Date(iso)).getUTCFullYear()}, ${horaCR(iso)}`;

/** «hoy / ayer / hace N días / hace N sem / 26 sept». */
function haceCuanto(iso: string): string {
  const d = new Date(iso);
  const ago = Math.max(0, -diasDesdeHoyCR(d));
  if (ago === 0) return "hoy";
  if (ago === 1) return "ayer";
  if (ago < 7) return `hace ${ago} días`;
  if (ago < 60) return `hace ${Math.round(ago / 7)} sem`;
  return diaCorto(d);
}

const ACTIVITY_SOURCE_LABEL: Record<NonNullable<ClientRow["lastActivitySource"]>, string> = {
  session_past: "Reunión",
  note: "Nota",
  agent_run: "Agente",
};

/** El `title` de «Última actividad»: lo que antes eran dos columnas propias. */
function tituloDeActividad(row: ClientRow): string {
  const partes: string[] = [];
  if (row.lastActivityAt) partes.push(`Última actividad: ${fechaYHoraCR(row.lastActivityAt)}`);
  partes.push(`Última reunión de ventas: ${row.lastSalesMeeting ? haceCuanto(row.lastSalesMeeting) : "—"}`);
  partes.push(`Última sesión del CSE: ${row.lastCseMeeting ? haceCuanto(row.lastCseMeeting) : "—"}`);
  return partes.join("\n");
}

/** Celda "Última actividad" — solo pasado, con su fuente debajo. */
function LastActivityCell({ row }: { row: ClientRow }) {
  if (!row.lastActivityAt || !row.lastActivitySource) {
    return <span className="text-fg-muted" title={tituloDeActividad(row)}>—</span>;
  }
  const fuente = ACTIVITY_SOURCE_LABEL[row.lastActivitySource];
  return (
    <span className="flex min-w-0 flex-col gap-0.5" title={tituloDeActividad(row)}>
      <span className="whitespace-nowrap text-[13px] text-fg-secondary">{haceCuanto(row.lastActivityAt)}</span>
      <span className="truncate text-xs text-fg-muted">{row.lastActivityLabel ? `${fuente} · ${row.lastActivityLabel}` : fuente}</span>
    </span>
  );
}

/** Celda "Próxima reunión" — solo futuro: el día y, debajo, la hora y de qué es. */
function NextMeetingCell({ row }: { row: ClientRow }) {
  if (!row.nextMeetingAt) {
    return <span className="whitespace-nowrap text-[13px] text-fg-muted">Sin agendar</span>;
  }
  const dias = Math.max(0, diasDesdeHoyCR(new Date(row.nextMeetingAt)));
  const dia = dias === 0 ? "hoy" : dias === 1 ? "mañana" : diaConSemana(row.nextMeetingAt);
  const debajo = [horaCR(row.nextMeetingAt), row.nextMeetingLabel].filter(Boolean).join(" · ");
  return (
    <span className="flex min-w-0 flex-col gap-0.5" title={row.nextMeetingLabel ?? undefined}>
      <span className="whitespace-nowrap text-[13px] font-medium text-fg">{dia}</span>
      <span className="truncate text-xs text-fg-muted">{debajo}</span>
    </span>
  );
}

/** Celda "Etapa": el nombre, «3 de 9» y una barra con un trazo por etapa de la línea. */
function EtapaCell({ etapa }: { etapa: EtapaDeFila | null }) {
  if (!etapa) return <span className="text-[13px] text-fg-muted">—</span>;
  const bloqueado = /bloquead/i.test(etapa.label);
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[13px]">
        <span className={cn("font-medium", bloqueado ? "text-warn-ink" : "text-fg")}>{etapa.label}</span>{" "}
        <span className="text-xs text-fg-muted">
          {etapa.posicion ? `${etapa.posicion.index} de ${etapa.posicion.total}` : "fuera de la línea"}
          {etapa.otros > 0 && ` · +${etapa.otros}`}
        </span>
      </span>
      {etapa.posicion && (
        <span className="flex gap-0.5" aria-hidden="true">
          {Array.from({ length: etapa.posicion.total }, (_, k) => (
            <span
              key={k}
              className={cn(
                "h-[5px] w-2.5 rounded-full",
                k < etapa.posicion!.index - 1 ? "bg-success" : k === etapa.posicion!.index - 1 ? "bg-brand" : "bg-surface-active",
              )}
            />
          ))}
        </span>
      )}
    </span>
  );
}

function iniciales(nombre: string): string {
  const partes = nombre.split(/[\s._-]+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "—";
}

/**
 * El menú «⋯» de la fila. Corta el clic (y el teclado) para que abrirlo no navegue a la ficha:
 * la fila entera es clickeable y el panel del menú vive dentro de ella.
 */
function AccionesDeFila({ row, puedeEliminar }: { row: ClientRow; puedeEliminar: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [confirmando, setConfirmando] = useState(false);
  if (!puedeEliminar) return null;
  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex justify-end">
      <Menu
        align="end"
        aria-label={`Más acciones de ${row.name}`}
        triggerClassName="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        trigger={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        }
        items={[{ key: "eliminar", label: "Eliminar la empresa", danger: true, onSelect: () => setConfirmando(true) }]}
      />
      <ConfirmDialog
        open={confirmando}
        onConfirm={async () => {
          const r = await fetch(`/api/clients/${row.id}`, { method: "DELETE" });
          if (!r.ok) {
            toast.error("No se pudo eliminar la empresa.");
            return;
          }
          router.refresh();
        }}
        onCancel={() => setConfirmando(false)}
        title="¿Eliminar la empresa?"
        description={`Se eliminará «${row.name}» junto con sus auditorías, implementaciones y documentos.`}
        confirmLabel="Eliminar"
      />
    </span>
  );
}

/**
 * La pestaña abierta. Las tres primeras son categorías de EMPRESA (`ClientKind`); la cuarta es
 * un atajo a los PROYECTOS internos, que no es una categoría de empresa y por eso no suma al
 * censo. Romper la simetría es a propósito: ver la lista de empresas que contienen trabajo
 * interno obliga a entrar a cada una para descubrir CUÁL de sus proyectos lo es.
 */
type Pestana = ClientKind | typeof PESTANA_INTERNOS;
const PESTANA_INTERNOS = "PROYECTOS_INTERNOS";

export default function ClientsGrid({
  clients,
  activeCse,
  proyectosInternos,
  opcionesDeEncargado,
  puedeReasignarEncargado,
  puedeEliminar,
}: {
  clients: ClientRow[];
  activeCse: ActiveCse | null;
  proyectosInternos: ProyectoInternoRow[];
  /** El equipo activo, para el desplegable de la columna «CSE encargado». Vacío si no se puede editar. */
  opcionesDeEncargado: OpcionDeEncargado[];
  /** `proyectos.reasignarEncargado` EFECTIVO, resuelto en el servidor. No es el candado: la ruta lo re-exige. */
  puedeReasignarEncargado: boolean;
  /** `clientes.delete` EFECTIVO: sin él, la fila no ofrece el menú «⋯». La API lo re-exige. */
  puedeEliminar: boolean;
}) {
  const router = useRouter();

  // ── Pestañas de CATEGORÍA (qué ES la empresa) ────────────────────────────────
  // Abre SIEMPRE en "Clientes": la cartera es el caso de uso del 99% de las visitas.
  // Las otras existen para que un aliado o una entidad interna mal marcada se pueda
  // encontrar y corregir — no para navegarlas a diario.
  const [pestana, setPestana] = useState<Pestana>("CLIENTE");
  const enInternos = pestana === PESTANA_INTERNOS;
  // Fuera de la pestaña de proyectos, la de empresas abierta. Es lo que leen los ejes 2 y 3.
  const kindTab: ClientKind = enInternos ? "CLIENTE" : pestana;
  const countByKind = useMemo(() => {
    const acc = Object.fromEntries(CLIENT_KINDS.map((k) => [k, 0])) as Record<ClientKind, number>;
    for (const c of clients) acc[c.kind] = (acc[c.kind] ?? 0) + 1;
    return acc;
  }, [clients]);
  const kindClients = useMemo(() => clients.filter((c) => c.kind === kindTab), [clients, kindTab]);

  // Pertenencia: "mine" (soy owner) · "shared" (compartidos conmigo) · "all" (accesibles).
  // Para todos los roles (pedido de Elías, 2026-10-04): quien ve la cartera entera también lleva
  // cuentas propias y las quiere separar. Los que ven todo abren en "Todos".
  const canFilter = !!activeCse;

  const myEmail = activeCse?.email.toLowerCase() ?? null;
  const myName = activeCse?.name.toLowerCase() ?? null;
  const isMine = useCallback(
    (c: ClientRow) =>
      !!myEmail &&
      (c.cseEmails.some((e) => e === myEmail) || c.cseNames.some((n) => n.toLowerCase() === myName)),
    [myEmail, myName],
  );

  // Mis clientes / compartidos se calculan DENTRO de la categoría abierta: los dos ejes
  // se componen (categoría × pertenencia), no compiten.
  const mineClients = useMemo(() => kindClients.filter(isMine), [kindClients, isMine]);
  const sharedClients = useMemo(
    () => kindClients.filter((c) => c.isShared && !isMine(c)),
    [kindClients, isMine],
  );

  // Roles "ven todo" abren el índice en "Todos" (su caso normal es la cartera completa).
  // CSE abre SIEMPRE en "Mis clientes" (aunque esté vacía), no en "Compartido".
  const canSeeAll = !!activeCse?.canSeeAll;
  const [tab, setTab] = useState<Pertenencia>(() =>
    !canFilter ? "all" : canSeeAll ? "all" : "mine",
  );

  const enPertenencia = !canFilter
    ? kindClients
    : tab === "mine"
      ? mineClients
      : tab === "shared"
        ? sharedClients
        : kindClients;

  // ── Eje 2: qué TIENE la empresa ──────────────────────────────────────────────
  // Las pestañas de arriba responden "qué ES". Esto responde "qué tiene", que es lo que
  // alguien viene a preguntar de verdad cuando abre esta pantalla. Los dos ejes se
  // COMPONEN (categoría × pertenencia × vista × búsqueda), no compiten.
  const [vista, setVista] = useState<VistaDeCartera>(VISTA_POR_DEFECTO);

  // ── La búsqueda vive ACÁ, no adentro de <Table> ──────────────────────────────
  // Mientras el término estaba encerrado en la primitiva, esta pantalla no tenía forma de
  // saber cuántas filas se ven, y los contadores contaban el censo mientras la tabla mostraba
  // otra cosa. Con el término acá, el número de cada opción es exactamente la cantidad de
  // filas que verías al elegirla — también mientras escribes.
  const [busqueda, setBusqueda] = useState("");

  const buscados = useMemo(
    () => filtrarPorBusqueda(enPertenencia, (c) => `${c.name} ${c.company ?? ""} ${c.proyectosAbiertos.join(" ")}`, busqueda),
    [enPertenencia, busqueda],
  );
  const contadores = useMemo(() => contarVistas(buscados), [buscados]);
  const displayedClients = useMemo(() => aplicarVista(buscados, vista), [buscados, vista]);

  // Qué opciones se pintan. Se mide contra la CATEGORÍA entera y no contra lo buscado: si no,
  // los controles aparecerían y desaparecerían mientras se teclea.
  const vistas = useMemo(() => vistasARenderizar(kindClients, vista), [kindClients, vista]);

  const limpiarTodo = () => {
    setVista(VISTA_POR_DEFECTO);
    setBusqueda("");
  };

  /** Las salidas de un estado vacío. Cada una deshace exactamente lo que lo causó. */
  function ejecutar(a: AccionDeVacio) {
    switch (a.tipo) {
      case "ver-todos":
        setTab("all");
        break;
      case "quitar-filtro":
        setVista(VISTA_POR_DEFECTO);
        break;
      case "buscar-sin-filtro":
        // Conserva el TÉRMINO y saca el filtro: es lo que se quiere el 90% de las veces.
        setVista(VISTA_POR_DEFECTO);
        break;
      case "limpiar-todo":
        limpiarTodo();
        break;
      case "ir-a-categoria":
        /* Salta a la categoría donde el término SÍ aparece, CONSERVANDO la búsqueda: la persona
           venía buscando eso. Borrarla la dejaría en una lista de 20 filas sin su empresa a la
           vista, que es media respuesta. */
        setPestana(a.kind);
        break;
    }
  }

  const linea = describirVista({
    visibles: displayedClients.length,
    totalDeCategoria: kindClients.length,
    contableDeCategoria: CLIENT_KIND_META[kindTab].contable,
    pertenencia: canFilter ? tab : null,
    vista,
    busqueda,
  });

  /* Cuántas coinciden con el término en CADA categoría. Se mide sobre `clients` —el censo
     accesible entero, sin pestaña ni vista— porque la pregunta que responde es «¿existe en algún
     lado?», y cualquier filtro intermedio la volvería a responder que no. Es lo que le faltaba
     al vacío para poder decir dónde SÍ está. */
  const coincidenPorCategoria = useMemo(() => {
    if (!busqueda.trim()) return undefined;
    const acc: Partial<Record<ClientKind, number>> = {};
    for (const c of filtrarPorBusqueda(clients, (x) => `${x.name} ${x.company ?? ""}`, busqueda)) {
      acc[c.kind] = (acc[c.kind] ?? 0) + 1;
    }
    return acc;
  }, [clients, busqueda]);

  const vacio = explicarListaVacia({
    kind: kindTab,
    enCategoria: kindClients.length,
    enPertenencia: enPertenencia.length,
    enVista: aplicarVista(enPertenencia, vista).length,
    pertenencia: canFilter ? tab : null,
    vista,
    busqueda,
    coincidenEnOtraCategoria: coincidenPorCategoria,
  });

  // ── La pestaña de PROYECTOS internos ─────────────────────────────────────────
  // Comparte el buscador con el resto de la pantalla (es el mismo campo), pero busca sobre
  // otra cosa: nombre del proyecto, empresa y tipo.
  const internosBuscados = useMemo(
    () => filtrarPorBusqueda(proyectosInternos, textoBuscableDe, busqueda),
    [proyectosInternos, busqueda],
  );

  /** La línea de abajo del nombre: qué se está haciendo. Sin proyecto, qué es la empresa. */
  const debajoDelNombre = (c: ClientRow): string => {
    if (c.proyectosAbiertos.length > 0) return c.proyectosAbiertos.join(" · ");
    if (c.kind === "PROSPECTO") return "Prospecto de Ventas: todavía no compró";
    if (c.kind === "ALIADO") return "Aliado comercial: no es cartera";
    if (c.kind === "INTERNO") return "Empresa nuestra";
    return "Sin proyecto abierto";
  };

  const columns: TableColumn<ClientRow>[] = [
    {
      key: "client",
      header: "Empresa",
      sortValue: (c) => c.name,
      render: (c) => (
        <span data-recorrido="clientes.empresa" className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-fg">{c.name}</span>
            {c.isShared && !isMine(c) && (
              <span className="flex-shrink-0 rounded-full border border-line bg-surface px-[7px] text-[11px] font-medium text-fg-secondary">
                compartido contigo
              </span>
            )}
          </span>
          <span
            className={cn("truncate text-xs", c.proyectosAbiertos.length > 0 ? "text-fg-secondary" : "text-fg-muted")}
            title={tituloDeProyectos(c.resumen)}
          >
            {debajoDelNombre(c)}
          </span>
        </span>
      ),
    },
    {
      key: "etapa",
      header: "Etapa",
      // Sin etapa va al fondo; fuera de la línea (Bloqueado, Continuidad) antes que cualquier posición.
      sortValue: (c) => (c.etapa ? (c.etapa.posicion?.index ?? 0) : null),
      width: "w-[164px]",
      hideOnMobile: true,
      render: (c) => <EtapaCell etapa={c.etapa} />,
    },
    {
      key: "cse",
      header: "CSE encargado",
      sortValue: (c) => c.cseNames[0],
      width: "w-[164px]",
      /* ⭐ SEGUNDA COLUMNA DE DATOS (Elías, 2026-08-22). Después del nombre, lo que se pregunta de
         una cuenta es de quién es. Se ve siempre, también en pantallas angostas.
         ⭐ Editable: elegir acá reasigna la CUENTA — escribe `csl_encargado` en todos los
         proyectos del cliente que están en el pipeline de Implementación de HubSpot. Sin
         permiso se pinta exactamente como antes (texto). Ver `CseEncargadoSelect`. */
      headerHint:
        "Cambiar este valor actualiza la propiedad «CSE encargado» en HubSpot, en todos los " +
        "proyectos del cliente que están en el pipeline de Implementación de HubSpot. Los " +
        "proyectos de Desarrollo o Sitios web no se tocan: tienen su propio encargado técnico.",
      render: (c) => (
        <span className="flex min-w-0 items-center gap-2">
          {c.cseNames.length > 0 ? (
            <span className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border border-line bg-surface-hover text-[10px] font-semibold text-fg-secondary">
              {iniciales(c.cseNames[0])}
            </span>
          ) : (
            <span className="h-[22px] w-[22px] flex-shrink-0 rounded-full border border-dashed border-line" aria-hidden="true" />
          )}
          <span className="min-w-0 text-[13px]">
            <CseEncargadoSelect
              clientId={c.id}
              clientName={c.name}
              nombres={c.cseNames}
              opciones={opcionesDeEncargado}
              puedeEditar={puedeReasignarEncargado}
            />
          </span>
        </span>
      ),
    },
    {
      key: "lastActivity",
      header: "Última actividad",
      sortValue: (c) => (c.lastActivityAt ? new Date(c.lastActivityAt) : null),
      // Flexible como en el diseño (1fr junto al 1,6fr de la empresa): con `table-fixed` se dice en %.
      width: "w-[16%]",
      render: (c) => <LastActivityCell row={c} />,
    },
    {
      key: "nextMeeting",
      header: "Próxima reunión",
      sortValue: (c) => (c.nextMeetingAt ? new Date(c.nextMeetingAt) : null),
      width: "w-[130px]",
      render: (c) => <NextMeetingCell row={c} />,
    },
    {
      key: "tam",
      header: "TAM",
      // Sin estimar (null) va al FONDO en ambos sentidos del sort: es ausencia de dato,
      // no un valor bajo. El Table trata null como "sin valor" y lo manda al final.
      sortValue: (c) => c.tamUsd,
      width: "w-[102px]",
      align: "right",
      hideOnMobile: true,
      render: (c) =>
        c.tamUsd === null ? (
          <span className="whitespace-nowrap text-xs text-fg-muted" title="Ventas todavía no estimó el potencial de esta cuenta">
            Sin estimar
          </span>
        ) : (
          <span className="whitespace-nowrap text-[13px] tabular-nums text-fg-secondary">{formatTamUsd(c.tamUsd)}</span>
        ),
    },
    // Columnas "Reunión ventas" y "Sesión CSE" retiradas (2026-10-04): viven en el `title` de
    // "Última actividad" y en el panel de reuniones de la ficha. "Proyectos" pasó a la línea de
    // abajo del nombre, que ahora dice CUÁLES son y no solo cuántos.
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-[51px]",
      render: (c) => <AccionesDeFila row={c} puedeEliminar={puedeEliminar} />,
    },
  ];

  /** La otra tabla: un PROYECTO por fila. */
  const columnasInternos: TableColumn<ProyectoInternoRow>[] = [
    {
      key: "proyecto",
      header: "Proyecto",
      sortValue: (p) => p.nombre,
      render: (p) => <span className="block truncate text-sm font-semibold text-fg">{p.nombre}</span>,
    },
    {
      key: "empresa",
      header: "Empresa",
      sortValue: (p) => p.clienteNombre,
      width: "w-48",
      render: (p) => <span className="block truncate text-[13px] text-fg-secondary">{p.clienteNombre}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      sortValue: (p) => p.tipo,
      width: "w-52",
      hideOnMobile: true,
      // `null` = HubSpot no declaró el pipeline. Se muestra como ausencia y no se degrada al
      // legacy: en una tabla de tres filas, inventar el rótulo se nota y engaña.
      render: (p) =>
        p.tipo ? (
          <span className="block truncate text-[13px] text-fg-secondary">{p.tipo}</span>
        ) : (
          <span className="text-fg-muted" title="HubSpot no declaró el pipeline de este proyecto">
            —
          </span>
        ),
    },
    {
      key: "etapa",
      header: "Etapa",
      sortValue: (p) => p.etapa,
      width: "w-40",
      hideOnMobile: true,
      render: (p) =>
        p.etapa ? (
          <span className="block truncate text-[13px] text-fg-secondary">{p.etapa}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      key: "encargado",
      header: "Encargado",
      sortValue: (p) => p.encargado,
      width: "w-40",
      hideOnMobile: true,
      render: (p) =>
        p.encargado ? (
          <span className="block truncate text-[13px] text-fg-secondary">{p.encargado}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Eje 1 — qué ES la empresa. Separa la cartera de lo que NO es cliente (aliados
          comerciales, nosotros mismos, prospectos de Ventas). Pestañas subrayadas: son las
          secciones de la pantalla; los filtros de cada una van abajo, como segmentados.

          ⚠ Estos contadores cuentan el CENSO, no las filas visibles, y es a propósito: esta
          es la única pantalla del sistema que carga las cuatro categorías (`kinds: "all"`), o
          sea el único lugar desde donde se caza una empresa mal clasificada. Si se
          recalcularan bajo el filtro, esa capacidad se apagaría sin que nadie lo note. Lo que
          reconcilia el censo con lo que hay en la tabla es la línea de verdad de más abajo. */}
      <div data-recorrido="clientes.categorias">
      <Tabs
        aria-label="Qué se está viendo"
        value={pestana}
        onChange={setPestana}
        items={[
          ...CLIENT_KINDS
            // ⚠ La categoría «Nuestras empresas» solo se pinta si hay alguna. Hoy son 0, y
            // una pestaña vacía cuyo nombre se parece al de la de al lado es exactamente lo
            // que hizo que alguien la leyera como "los clientes con proyectos internos". La
            // clasificación sigue disponible en la ficha de cada empresa.
            .filter((k) => k !== "INTERNO" || (countByKind.INTERNO ?? 0) > 0)
            .map((k) => ({
              key: k as Pestana,
              label: CLIENT_KIND_META[k].plural,
              count: countByKind[k] ?? 0,
            })),
          {
            key: PESTANA_INTERNOS as Pestana,
            label: COPY_PROYECTOS_INTERNOS.titulo,
            count: proyectosInternos.length,
          },
        ]}
      />
      </div>

      {/* Los filtros y su línea de verdad van en UN bloque: la línea describe lo que los filtros
          hicieron, así que se lee pegada a ellos y despegada de la tabla.
          El buscador lo monta ESTE componente y no `<Table>`: la primitiva devuelve su estado
          vacío ANTES de pintar su barra, así que un filtro que deja la lista en cero se llevaba
          puesto el control que hacía falta para deshacerlo. Acá la salida existe siempre. */}
      <div className="space-y-2">
        <div data-recorrido="clientes.filtros" className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Eje 2 — de quién es. Solo para un CSE: el Super Admin ve todo sin filtro. No aplica
                a la pestaña de proyectos internos, que es trabajo nuestro y no tiene dueño de cartera. */}
            {canFilter && !enInternos && (
              <Segmentado
                etiqueta="De quién es"
                valor={tab}
                onCambio={setTab}
                opciones={(canSeeAll
                  ? (["all", "mine", "shared"] as const)
                  : (["mine", "shared", "all"] as const)
                ).map((key) => ({
                  clave: key,
                  etiqueta: key === "all" ? "Todos" : key === "mine" ? "Mis clientes" : "Compartidos",
                  cuenta:
                    key === "all"
                      ? kindClients.length
                      : key === "mine"
                        ? mineClients.length
                        : sharedClients.length,
                }))}
              />
            )}
            {/* Eje 3 — qué TIENE la empresa. Solo se pintan las vistas que parten el universo:
                una opción que deja pasar a todos y una que no deja pasar a nadie se ven igual
                que una que funciona, y las dos son un control muerto. */}
            {!enInternos && vistas.length > 0 && (
              <Segmentado
                etiqueta="Qué tiene la empresa"
                valor={vista}
                onCambio={setVista}
                opciones={vistas.map((v) => ({
                  clave: v.key,
                  etiqueta: v.label,
                  // La `ayuda` explica por qué el número puede no cuadrar con Éxito del cliente ni
                  // con Cobranza. Es LO ÚNICO que evita que ese descuadre se lea como un bug.
                  title: v.ayuda,
                  cuenta: contadores[v.key],
                  // Una vista sin resultados no se puede elegir… salvo que sea la que está puesta:
                  // deshabilitar la activa dejaría un filtro aplicado sin forma de sacarlo.
                  deshabilitada: contadores[v.key] === 0 && vista !== v.key,
                }))}
              />
            )}
          </div>
          <label className="flex w-[260px] max-w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-[7px] text-fg-muted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={enInternos ? "Buscar por proyecto, empresa o tipo…" : "Buscar empresa o proyecto…"}
              aria-label={enInternos ? "Buscar un proyecto interno" : "Buscar una empresa o un proyecto"}
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-muted"
            />
          </label>
        </div>

        {/* LA LÍNEA DE VERDAD — lo único en toda la pantalla que afirma cuántas filas se ven.
            Sin nada filtrando no se pinta: un cartel que dice "155 de 155" es ruido. */}
        {enInternos && busqueda.trim() && (
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span>
              Mostrando {internosBuscados.length} de{" "}
              {contarConPlural(proyectosInternos.length, COPY_PROYECTOS_INTERNOS.contable)} ·{" "}
              «{busqueda.trim()}»
            </span>
            <button onClick={() => setBusqueda("")} className="text-brand hover:text-brand-light">
              Limpiar
            </button>
          </div>
        )}
        {!enInternos && linea && (
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span>{linea.texto}</span>
            {linea.hayQueLimpiar && (
              <button onClick={limpiarTodo} className="text-brand hover:text-brand-light">
                Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      {enInternos ? (
        /* Un PROYECTO por fila. La fila lleva al proyecto, no a la empresa: llegar a la
           empresa y tener que adivinar cuál de sus tres proyectos es el interno era justamente
           el motivo por el que esta pestaña muestra proyectos. */
        <>
          <Table
            variante="sistema"
            columns={columnasInternos}
            rows={internosBuscados}
            rowKey={(p) => p.id}
            onRowClick={(p) => router.push(urlDeProyecto(p.clienteId, p.id))}
            initialSort={{ key: "empresa", dir: "asc" }}
            empty={
              <EmptyState
                variant="dashed"
                title={
                  busqueda.trim()
                    ? `Sin resultados para «${busqueda.trim()}»`
                    : COPY_PROYECTOS_INTERNOS.vacioTitulo
                }
                description={
                  busqueda.trim()
                    ? `Ninguno de los ${contarConPlural(
                        proyectosInternos.length,
                        COPY_PROYECTOS_INTERNOS.contable,
                      )} coincide.`
                    : COPY_PROYECTOS_INTERNOS.vacioDetalle
                }
                action={
                  busqueda.trim() ? (
                    <BotonBlanco onClick={() => setBusqueda("")}>Limpiar búsqueda</BotonBlanco>
                  ) : undefined
                }
              />
            }
          />
          <p className="text-xs text-fg-muted">
            Proyectos de Smarteam para Smarteam: no se facturan y no son cartera de nadie. Cada fila abre el proyecto, no la empresa.
          </p>
        </>
      ) : (
        <>
          <Table
            variante="sistema"
            columns={columns}
            rows={displayedClients}
            rowKey={(c) => c.id}
            onRowClick={(c) => router.push(`/clients/${c.id}`)}
            initialSort={{ key: "lastActivity", dir: "desc" }}
            empty={
              <EmptyState
                variant="dashed"
                title={vacio.titulo}
                description={vacio.detalle}
                action={
                  vacio.acciones.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {vacio.acciones.map((a) => (
                        <BotonBlanco key={a.tipo} onClick={() => ejecutar(a)}>
                          {a.label}
                        </BotonBlanco>
                      ))}
                    </div>
                  ) : undefined
                }
              />
            }
          />
          {displayedClients.length > 0 && (
            <p className="text-xs text-fg-muted">
              Lo de actividad más reciente, arriba. La etapa es la del proyecto de implementación; si la empresa tiene otro abierto, sale en su ficha.
            </p>
          )}
        </>
      )}
    </div>
  );
}
