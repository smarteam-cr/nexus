"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  Tabs,
  Avatar,
  EmptyState,
  SearchFilterBar,
  type TableColumn,
} from "@/components/ui";
import DeleteClientButton from "./DeleteClientButton";
import CseEncargadoSelect, { type OpcionDeEncargado } from "@/components/clients/CseEncargadoSelect";
import NuevoProyectoStepper from "@/components/projects/NuevoProyectoStepper";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { calendarDaysFromToday } from "@/lib/utils/relative-date";
import { CLIENT_KINDS, CLIENT_KIND_META, formatTamUsd } from "@/lib/clients/kind";
import { filtrarPorBusqueda } from "@/lib/ui/text-search";
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
  resumirPotencial,
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
  /** Qué TIENE la empresa: 3 escalares. Alimenta la barra de filtros y la columna Proyectos. */
  resumen: ResumenDeProyectos;
  isShared: boolean;            // compartido con el usuario actual (GRANT a él o a su rol)
  kind: ClientKind;             // qué ES la empresa (cliente/prospecto/aliado/interno)
  tamUsd: number | null;        // techo anual estimado en USD; null = Ventas no lo estimó
}

/** Formatea una fecha pasada en forma relativa (hoy/ayer/hace N días/sem/fecha). */
function PastDateCell({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-fg-muted">—</span>;
  const d = new Date(iso);
  const ago = Math.max(0, -calendarDaysFromToday(d));
  const rel =
    ago === 0  ? "hoy" :
    ago === 1  ? "ayer" :
    ago < 7    ? `hace ${ago} días` :
    ago < 60   ? `hace ${Math.round(ago / 7)} sem` :
    d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  return (
    <span
      className="text-fg-muted whitespace-nowrap"
      title={d.toLocaleString("es-ES")}
    >
      {rel}
    </span>
  );
}

const ACTIVITY_SOURCE_LABEL: Record<NonNullable<ClientRow["lastActivitySource"]>, string> = {
  session_past: "Última reunión",
  note:         "Última nota",
  agent_run:    "Última ejecución de agente",
};

/** Celda "Última actividad" — solo pasado. Formatea como "hoy/ayer/hace N días/hace N sem/fecha". */
function LastActivityCell({ row }: { row: ClientRow }) {
  if (!row.lastActivityAt || !row.lastActivitySource) {
    return <span className="text-fg-muted">—</span>;
  }
  const d = new Date(row.lastActivityAt);
  const ago = Math.max(0, -calendarDaysFromToday(d));
  const rel =
    ago === 0  ? "hoy" :
    ago === 1  ? "ayer" :
    ago < 7    ? `hace ${ago} días` :
    ago < 60   ? `hace ${Math.round(ago / 7)} sem` :
    d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

  const sourceText = row.lastActivityLabel
    ? `${ACTIVITY_SOURCE_LABEL[row.lastActivitySource]}: ${row.lastActivityLabel}`
    : ACTIVITY_SOURCE_LABEL[row.lastActivitySource];

  return (
    <span
      className="whitespace-nowrap text-fg-secondary"
      title={`${sourceText} · ${d.toLocaleString("es-ES")}`}
    >
      {rel}
    </span>
  );
}

/** Celda "Próxima reunión" — solo futuro. Formatea como "hoy/mañana/en N días/fecha". */
function NextMeetingCell({ row }: { row: ClientRow }) {
  if (!row.nextMeetingAt) {
    return <span className="text-fg-muted">—</span>;
  }
  const d = new Date(row.nextMeetingAt);
  const days = Math.max(0, calendarDaysFromToday(d));
  const rel =
    days === 0 ? "hoy" :
    days === 1 ? "mañana" :
    days < 7   ? `en ${days} días` :
    d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  const labelText = row.nextMeetingLabel
    ? `Próxima: ${row.nextMeetingLabel}`
    : "Próxima reunión";

  return (
    <span
      className="whitespace-nowrap text-success-ink"
      title={`${labelText} · ${d.toLocaleString("es-ES")}`}
    >
      {rel}
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
  slotTraer,
}: {
  clients: ClientRow[];
  activeCse: ActiveCse | null;
  proyectosInternos: ProyectoInternoRow[];
  /** El equipo activo, para el desplegable de la columna «CSE encargado». Vacío si no se puede editar. */
  opcionesDeEncargado: OpcionDeEncargado[];
  /** `proyectos.reasignarEncargado` EFECTIVO, resuelto en el servidor. No es el candado: la ruta lo re-exige. */
  puedeReasignarEncargado: boolean;
  /**
   * El botón «Traer de HubSpot», ya envuelto en su propio `<Suspense>` por el server component.
   * Llega como nodo y no como número para que contar las empresas —5 llamadas a HubSpot— no
   * bloquee la tabla de clientes.
   */
  slotTraer: React.ReactNode;
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

  // Pestañas: "mine" (soy owner) · "shared" (compartidos conmigo) · "all" (accesibles).
  // Solo para un CSE específico — el Super Admin ve todo sin filtro.
  const canFilter = !!activeCse && !activeCse.isSuperAdmin;

  const isMine = useMemo(() => {
    if (!activeCse) return (_c: ClientRow) => false;
    const myEmail = activeCse.email.toLowerCase();
    const myName = activeCse.name.toLowerCase();
    return (c: ClientRow) =>
      c.cseEmails.some((e) => e === myEmail) ||
      c.cseNames.some((n) => n.toLowerCase() === myName);
  }, [activeCse]);

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
  // otra cosa. Con el término acá, el número de cada píldora es exactamente la cantidad de
  // filas que verías al clickearla — también mientras escribís.
  const [busqueda, setBusqueda] = useState("");

  const buscados = useMemo(
    () => filtrarPorBusqueda(enPertenencia, (c) => `${c.name} ${c.company ?? ""}`, busqueda),
    [enPertenencia, busqueda],
  );
  const contadores = useMemo(() => contarVistas(buscados), [buscados]);
  const displayedClients = useMemo(() => aplicarVista(buscados, vista), [buscados, vista]);

  // Qué píldoras se pintan. Se mide contra la CATEGORÍA entera y no contra lo buscado: si no,
  // los controles aparecerían y desaparecerían mientras se teclea.
  const vistas = useMemo(() => vistasARenderizar(kindClients, vista), [kindClients, vista]);

  // Potencial estimado de lo que se está viendo: la suma de los TAM cargados. Los "sin
  // estimar" se cuentan APARTE y nunca como 0 — si se sumaran como cero, el total diría
  // que la cartera vale menos de lo que vale y nadie sabría cuánto falta por estimar.
  // Y sin NINGÚN TAM cargado no dice "$0": dice que no hay dato. Hoy es el 100% de los casos.
  const potencial = useMemo(
    () => resumirPotencial(displayedClients.map((c) => c.tamUsd)),
    [displayedClients],
  );

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

  const columns: TableColumn<ClientRow>[] = [
    {
      key: "client",
      header: "Cliente",
      sortValue: (c) => c.name,
      // Width explícito: en table-fixed, sin width la columna se aplasta y el
      // truncate del IdentityCell la deja en 1-3 letras.
      width: "w-48",
      render: (c) => (
        <Table.IdentityCell
          leading={<Avatar name={c.name} colorSeed={c.id} size="sm" />}
          primary={c.name}
          secondary={c.company ?? undefined}
        />
      ),
    },
    {
      key: "lastActivity",
      header: "Última actividad",
      sortValue: (c) => (c.lastActivityAt ? new Date(c.lastActivityAt) : null),
      width: "w-36",
      render: (c) => <LastActivityCell row={c} />,
    },
    {
      key: "nextMeeting",
      header: "Próxima reunión",
      sortValue: (c) => (c.nextMeetingAt ? new Date(c.nextMeetingAt) : null),
      width: "w-36",
      render: (c) => <NextMeetingCell row={c} />,
    },
    {
      key: "cse",
      header: "CSE encargado",
      sortValue: (c) => c.cseNames[0],
      width: "w-32",
      hideOnMobile: true,
      /* ⭐ Editable: elegir acá reasigna la CUENTA — escribe `csl_encargado` en todos los
         proyectos del cliente que están en el pipeline de Implementación de HubSpot. Sin
         permiso se pinta exactamente como antes (texto). Ver `CseEncargadoSelect`. */
      headerHint:
        "Cambiar este valor actualiza la propiedad «CSE encargado» en HubSpot, en todos los " +
        "proyectos del cliente que están en el pipeline de Implementación de HubSpot. Los " +
        "proyectos de Desarrollo o Sitios web no se tocan: tienen su propio encargado técnico.",
      render: (c) => (
        <CseEncargadoSelect
          clientId={c.id}
          clientName={c.name}
          nombres={c.cseNames}
          opciones={opcionesDeEncargado}
          puedeEditar={puedeReasignarEncargado}
        />
      ),
    },
    {
      key: "salesMeeting",
      header: "Reunión ventas",
      sortValue: (c) => (c.lastSalesMeeting ? new Date(c.lastSalesMeeting) : null),
      width: "w-32",
      hideOnMobile: true,
      render: (c) => <PastDateCell iso={c.lastSalesMeeting} />,
    },
    {
      key: "cseMeeting",
      header: "Sesión CSE",
      sortValue: (c) => (c.lastCseMeeting ? new Date(c.lastCseMeeting) : null),
      width: "w-28",
      hideOnMobile: true,
      render: (c) => <PastDateCell iso={c.lastCseMeeting} />,
    },
    {
      key: "tam",
      header: "TAM",
      // Sin estimar (null) va al FONDO en ambos sentidos del sort: es ausencia de dato,
      // no un valor bajo. El Table trata null como "sin valor" y lo manda al final.
      sortValue: (c) => c.tamUsd,
      width: "w-24",
      align: "right",
      hideOnMobile: true,
      render: (c) => (
        <span
          className={c.tamUsd === null ? "text-fg-muted" : "tabular-nums text-fg-secondary"}
          title={c.tamUsd === null ? "Ventas todavía no estimó el potencial de esta cuenta" : undefined}
        >
          {formatTamUsd(c.tamUsd)}
        </span>
      ),
    },
    {
      key: "projects",
      header: "Proyectos",
      // Proyectos ABIERTOS y de verdad, no `_count`: ése contaba los contenedores
      // "Información del cliente" y había fichas mostrando 1 con cero proyectos. Con la barra
      // de filtros al lado eso dejaba de ser un detalle: la píldora diría «Sin proyecto
      // abierto» y esta misma fila mostraría 1.
      sortValue: (c) => c.resumen.abiertos,
      width: "w-20",
      render: (c) => (
        <span
          className={c.resumen.abiertos === 0 ? "text-fg-muted" : "tabular-nums text-fg-secondary"}
          title={tituloDeProyectos(c.resumen)}
        >
          {c.resumen.abiertos === 0 ? "—" : c.resumen.abiertos}
        </span>
      ),
    },
    // Columna "HubSpot" eliminada — todos los clientes están "En CRM" porque
    // están en el portal de Smarteam, así que la info era ruido. Si en algún
    // momento aparece un cliente con su propio Portal OAuth, lo destacamos
    // en otro lado (ej. badge en el detalle del cliente).
    // Columna "Creado" eliminada — la fecha está en el tooltip de "Última
    // actividad" y la columna ocupaba espacio sin aportar al flujo.
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-12",
      render: (c) => <DeleteClientButton clientId={c.id} clientName={c.name} />,
    },
  ];

  /** La otra tabla: un PROYECTO por fila. */
  const columnasInternos: TableColumn<ProyectoInternoRow>[] = [
    {
      key: "proyecto",
      header: "Proyecto",
      sortValue: (p) => p.nombre,
      width: "w-56",
      render: (p) => (
        <Table.IdentityCell
          leading={<Avatar name={p.nombre} colorSeed={p.id} size="sm" />}
          primary={p.nombre}
        />
      ),
    },
    {
      key: "empresa",
      header: "Empresa",
      sortValue: (p) => p.clienteNombre,
      width: "w-44",
      render: (p) => <span className="text-fg-secondary truncate block">{p.clienteNombre}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      sortValue: (p) => p.tipo,
      width: "w-48",
      hideOnMobile: true,
      // `null` = HubSpot no declaró el pipeline. Se muestra como ausencia y no se degrada al
      // legacy: en una tabla de tres filas, inventar el rótulo se nota y engaña.
      render: (p) =>
        p.tipo ? (
          <span className="text-fg-secondary truncate block">{p.tipo}</span>
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
          <span className="text-fg-secondary truncate block">{p.etapa}</span>
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
          <span className="text-fg-secondary truncate block">{p.encargado}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Eje 1 — qué ES la empresa. Separa la cartera de lo que NO es cliente (aliados
          comerciales, nosotros mismos, prospectos de Ventas). Se ve siempre.

          ⚠ Estos contadores cuentan el CENSO, no las filas visibles, y es a propósito: esta
          es la única pantalla del sistema que carga las cuatro categorías (`kinds: "all"`), o
          sea el único lugar desde donde se caza una empresa mal clasificada. Si se
          recalcularan bajo el filtro, esa capacidad se apagaría sin que nadie lo note. Lo que
          reconcilia el censo con lo que hay en la tabla es la línea de verdad de más abajo. */}
      <div className="flex items-center gap-2 flex-wrap">
        <Tabs
          aria-label="Qué se está viendo"
          variant="pill"
          size="sm"
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
        {!enInternos && displayedClients.length > 0 && (
          <span className="ml-auto text-xs text-fg-muted">
            Potencial estimado{" "}
            <span className="tabular-nums text-fg-secondary font-medium">
              {potencial.total === null ? "sin datos" : formatTamUsd(potencial.total)}
            </span>
            {potencial.sinEstimar > 0 && (
              <span className="text-fg-muted"> · {potencial.sinEstimar} sin estimar</span>
            )}
          </span>
        )}
      </div>

      {/* Eje 2 — de quién es. Solo para un CSE: el Super Admin ve todo sin filtro. No aplica
          a la pestaña de proyectos internos, que es trabajo nuestro y no tiene dueño de cartera. */}
      {canFilter && !enInternos && (
        <Tabs
          aria-label="Pertenencia"
          variant="pill"
          size="sm"
          value={tab}
          onChange={setTab}
          items={(canSeeAll
            ? (["all", "mine", "shared"] as const)
            : (["mine", "shared", "all"] as const)
          ).map((key) => ({
            key,
            label: key === "all" ? "Todos" : key === "mine" ? "Mis clientes" : "Compartido",
            count:
              key === "all"
                ? kindClients.length
                : key === "mine"
                  ? mineClients.length
                  : sharedClients.length,
          }))}
        />
      )}

      {/* El toolbar lo monta ESTE componente y no `<Table>`: la primitiva devuelve su estado
          vacío ANTES de pintar el toolbar (Table.tsx:121), así que un filtro que deja la lista
          en cero se llevaba puestos el buscador, las píldoras y "Nuevo proyecto" — o sea el
          control que hacía falta para deshacerlo. Acá la salida existe siempre.

          ⚠ El toolbar y su línea de verdad van en UN bloque con `pb-2`: la línea describe lo
          que el toolbar hizo, así que tiene que leerse pegada a él y despegada de la tabla. Sin
          esto, el `space-y-3` del contenedor los separa igual de todo y el buscador queda
          pisando el encabezado de la tabla. */}
      <div className="space-y-2 pb-3">
      <SearchFilterBar
        className="mb-0"
        search={{
          value: busqueda,
          onChange: setBusqueda,
          placeholder: enInternos
            ? "Buscar por proyecto, empresa o tipo…"
            : "Buscar por nombre o empresa…",
        }}
        action={
          <div className="flex items-center gap-2">
            {/* UN SOLO BOTÓN. El asistente de handoff y `NewClientButton` siguen en sus archivos
                pero ya no se montan: volver a mostrar cualquiera es una línea.

                "Nuevo cliente" no era redundante con éste, era una TRAMPA: creaba un cliente
                con nombre y empresa SIN exigir que existiera en HubSpot, y el alta después lo
                rechazaba ("Ese cliente no tiene empresa en HubSpot"). Al medirlo: 7 clientes sin
                empresa, 6 de ellos con CERO proyectos — fichas que no pueden tener un proyecto,
                ni handoff, ni cronograma. No se pierde ninguna capacidad sacándolo; lo que
                permitía hacer es exactamente lo que después no servía. */}
            {/* Sale primero y en secundario: traer es menos frecuente que crear, y su botón
                desaparece solo cuando no queda nada que traer. Llega por streaming aparte. */}
            {slotTraer}
            <NuevoProyectoStepper />
          </div>
        }
      >
        {/* Eje 3 — qué TIENE la empresa. Solo se pintan las vistas que parten el universo:
            una píldora que deja pasar a todos y una que no deja pasar a nadie se ven igual
            que una que funciona, y las dos son un control muerto. */}
        {!enInternos && vistas.length > 0 && (
          <Tabs
            aria-label="Qué tiene la empresa"
            className="sm:ml-3"
            variant="pill"
            size="sm"
            value={vista}
            onChange={setVista}
            items={vistas.map((v) => ({
              key: v.key,
              label: v.label,
              // La `ayuda` explica por qué el número puede no cuadrar con Éxito del cliente ni
              // con Cobranza. Es LO ÚNICO que evita que ese descuadre se lea como un bug.
              title: v.ayuda,
              count: contadores[v.key],
              // Una vista sin resultados no se puede elegir… salvo que sea la que está puesta:
              // deshabilitar la activa dejaría un filtro aplicado sin forma de sacarlo.
              disabled: contadores[v.key] === 0 && vista !== v.key,
            }))}
          />
        )}
      </SearchFilterBar>

      {/* LA LÍNEA DE VERDAD — lo único en toda la pantalla que afirma cuántas filas se ven.
          Sin nada filtrando no se pinta: un cartel que dice "155 de 155" es ruido. */}
      {enInternos && busqueda.trim() && (
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <span>
            Mostrando {internosBuscados.length} de{" "}
            {contarConPlural(proyectosInternos.length, COPY_PROYECTOS_INTERNOS.contable)} ·{" "}
            «{busqueda.trim()}»
          </span>
          <button onClick={() => setBusqueda("")} className="text-brand hover:underline">
            Limpiar
          </button>
        </div>
      )}
      {!enInternos && linea && (
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <span>{linea.texto}</span>
          {linea.hayQueLimpiar && (
            <button onClick={limpiarTodo} className="text-brand hover:underline">
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
        <Table
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
                  <button
                    onClick={() => setBusqueda("")}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 bg-brand/15 text-brand hover:bg-brand/25 transition-colors"
                  >
                    Limpiar búsqueda
                  </button>
                ) : undefined
              }
            />
          }
        />
      ) : (
        <Table
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
                      <button
                        key={a.tipo}
                        onClick={() => ejecutar(a)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 bg-brand/15 text-brand hover:bg-brand/25 transition-colors"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                ) : undefined
              }
            />
          }
        />
      )}
    </div>
  );
}
