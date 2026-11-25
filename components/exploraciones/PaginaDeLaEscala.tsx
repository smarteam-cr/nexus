"use client";

/**
 * PaginaDeLaEscala — La escala interna COMO LA VE EL CLIENTE, y editable (8 nov; Elías: «la página de resultados debe
 * verse igual externo que interno, pero interno debe funcionar como un artefacto que se puede editar»).
 *
 * Es la MISMA vista de la página pública (ResultadoDelTestVista, con su tema de hex literal) con los MISMOS datos: los
 * arma `paginaParaElCse` (lib/exploraciones/escala-para-el-cliente-server.ts), el mismo cálculo que sirve
 * /external/escala/[token]. Toda la edición es EN SU LUGAR (Elías: «se le da clic, se cambia el texto y se guarda»), y
 * entra por los huecos de `EdicionDeLaPagina`:
 *   · la página abre en «Resumen» (9 nov), la portada que presenta el vendedor (ResumenDeLaEscalaVista): «Armar el Resumen» /
 *     «Rehacer con IA» la pide al agente (/api/sales/exploraciones/[id]/escala/resumen), en la franja interna de arriba,
 *     FUERA del marco que imita la página del cliente (Elías, 9 nov), y cada texto se edita en su lugar
 *     (la operación `resumenDeLaEscala`); debajo de cada dato rojo y cada hallazgo, de dónde sale (solo adentro). Desde el
 *     24 nov (Elías con TEC · AE) la corrida sigue en el servidor y el aviso de arriba (`AvisoDelResumen`) dice en qué va,
 *     por qué falló o que hay respuestas nuevas; sin Resumen se ve la PLANTILLA (PlantillaDelResumenVista: la forma de la
 *     portada, sin texto inventado) con «Falta armar el Resumen» y su botón;
 *   · las pestañas de los departamentos son las de la página, con todas las áreas: la que el cliente no ve va punteada
 *     y dice «no la ve el cliente» (se elige en «Acceso» › «Qué equipos ve»);
 *   · la descripción de «Resultado general» se edita donde está y se rehace con IA (la guarda y la genera
 *     /api/sales/exploraciones/[id]/escala/descripcion, de la sesión que hizo la descripción: acá no se genera nada);
 *   · lo que dice la tarjeta de cada dimensión se edita dentro de la tarjeta (`textoDelRadar`, solo para el nivel en que
 *     se escribió: `textoVigenteDelRadar`), con «Usar lo que anotó Nexus» si lo hay;
 *   · en el radar, cada dimensión se ARRASTRA por su eje para cambiar su nivel (components/escala/ArrastreDelRadar.tsx;
 *     escribe por `useMarcarNivel`, lo mismo que los cinco niveles del detalle). Tocarla abre su panel, que es para LEER
 *     lo interno (evidencia o hipótesis, qué preguntar, «Llevar a la sesión N», los niveles): ahí no se edita texto.
 *   · los textos FIJOS de la página (16 nov; Elías: «toda la info… se pueda editar»): los títulos, «Por dónde empezar»,
 *     lo que cuesta quedarse así, los casos, los riesgos, «Ver detalles», la bajada y lo que hicimos del Resumen, el pie.
 *     Se editan en su lugar (`TextoFijo`, operación `textoDeLaPagina`) y los casos, los riesgos y lo que arma la página
 *     se pueden quitar para el cliente (lib/external/textos-de-la-pagina.ts).
 *   · «✨ Mejorar con IA» (23 nov, etapa 3 del plan maestro de «Hablar con Nexus»): en el Resumen y en cada área (la página
 *     entera) y, desde el 24 nov, en el encabezado de cada sección (antes era un botón por pieza, al pasar el cursor; Elías:
 *     «por sección, no por texto», como los documentos del cliente) abre el cajón «Nexus» con el lugar y la sección como
 *     chip (HablarConNexus.tsx): un pedido, una propuesta por pieza de esa sección, que se aplica por estas mismas
 *     operaciones. La página de cada área tiene su historial (HistorialDelArea.tsx).
 * Nada de esto lo ve el cliente hasta «Publicar» (16 nov, PublicarLaEscala.tsx, al lado de «Acceso»): el enlace sirve la
 * foto publicada.
 * Arriba de la página, fuera de ella: la línea del área (si la ve el cliente, cuánto tiene, sumarla o sacarla) y el
 * «Contexto para la descripción», que lee el agente de la descripción y NO ve el cliente (`contextoDeLaEscala`).
 * Todo se guarda en la exploración; la página se vuelve a pedir cuando cambia su versión. Lo que propone el agente y nadie
 * usó NO se dibuja: el cliente no lo ve. Para eso están la franja de sugerencias y la vista «Comparar áreas».
 */
import { useEffect, useRef, useState } from "react";
import { Alert, Button, ConfirmDialog, Drawer, Field, Skeleton, Spinner, Textarea, useToast } from "@/components/ui";
import ArrastreDelRadar from "@/components/escala/ArrastreDelRadar";
import { PESTANA_DEL_RESUMEN } from "@/components/external/test/ArribaDeLaEscala";
import ResultadoDelTestVista, { type EdicionDeLaPagina, type EdicionDeUnTextoFijo } from "@/components/external/test/ResultadoDelTestVista";
import PlantillaDelResumenVista from "@/components/external/test/PlantillaDelResumenVista";
import ResumenDeLaEscalaVista, { type EdicionDelResumen } from "@/components/external/test/ResumenDeLaEscalaVista";
import TextoEditableDeLaPagina from "@/components/external/test/TextoEditableDeLaPagina";
import type { Letra } from "@/lib/escala/documento/tipos";
import { MAX_CONTEXTO_DE_LA_ESCALA, MAX_TEXTO_DEL_RADAR } from "@/lib/exploraciones/contenido";
import { textoVigenteDelRadar } from "@/lib/exploraciones/escala-para-el-cliente";
import type { PaginaParaElCse } from "@/lib/exploraciones/escala-para-el-cliente-server";
import { MAX_TEXTO_DE_LA_PAGINA } from "@/lib/external/textos-de-la-pagina";
import DeDondeSale from "./DeDondeSale";
import { chequeoDelMapa, cuentaDelArea, fraseDeLaCuenta } from "@/lib/exploraciones/mapa";
import { AL_LUGAR, DEL_LUGAR, useLienzo } from "./contexto";
import ReunionesMalLeidas from "./ReunionesMalLeidas";
import HistorialDelResumen from "./HistorialDelResumen";
import { BotonDelHistorial } from "@/components/versiones/HistorialDeVersiones";
import { avisarQueLaEscalaCambio } from "./escala-al-dia";
import { useFalloCerrado, useResumenEnCurso } from "./useResumenEnCurso";
import { cuantoLleva, MINUTOS_SIN_LATIDO, queDiceElAviso, type AvisoDelResumen as AvisoDelResumenEnPantalla } from "@/lib/exploraciones/corrida-del-resumen";
import { leidoHasta, notasNuevasDesde, tituloDeLasNuevas } from "@/lib/exploraciones/completar-el-diagnostico";
import { DetalleDeDimension, useMarcarNivel } from "./DetalleDeLaDimension";
import { abrirNexusEnLaPreventa, EVENTO_LA_ESCALA_CAMBIO_CON_NEXUS } from "@/lib/exploraciones/abrir-nexus";
import { NOMBRE_DEL_BOTON } from "@/lib/pedirle-a-nexus/contrato";
import HistorialDelArea from "./HistorialDelArea";
import { conLoQueCuestaDelArea, piezasDelArea, piezasDelResumen, type LugarEnLaEscala, type PiezaDeLaEscala } from "@/lib/exploraciones/escala-con-nexus";
import { esDeLaSeccion } from "@/lib/external/secciones-de-la-escala";

/** Lo que responde la ruta de la descripción (la sesión que la hizo): de dónde sale la de cada área. */
interface DescripcionesDeLaEscala {
  areas: { areaId: string; descripcion: { texto: string; origen: "agente" | "mano" | "respaldo"; vigente: boolean } }[];
  /** Solo al rehacer: lo que el agente escribió y no quedó, con el motivo. */
  descartadas?: { areaId: string; motivos: string[] }[];
}

/** El tope de la descripción escrita a mano: el de la ruta de la descripción (`TOPE_DE_LA_DESCRIPCION_A_MANO`). */
const TOPE_DE_LA_DESCRIPCION = 700;

/** La página de la exploración, pedida de nuevo cada vez que la exploración cambia de versión. */
function usePagina(id: string, version: number) {
  const [estado, setEstado] = useState<{ pagina: PaginaParaElCse | null; error: string | null }>({ pagina: null, error: null });
  const [pedido, setPedido] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/sales/exploraciones/${id}/pagina-de-la-escala`, { cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as PaginaParaElCse & { error?: string };
        if (!r.ok) throw new Error(data.error ?? "No se pudo armar la página.");
        setEstado({ pagina: data, error: null });
        // «Publicar» vuelve a mirar si hay algo que el cliente no ve.
        avisarQueLaEscalaCambio();
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setEstado((x) => ({ ...x, error: e instanceof Error ? e.message : "No se pudo armar la página." }));
      });
    return () => ctrl.abort();
  }, [id, version, pedido]);
  return { ...estado, otraVez: () => setPedido((n) => n + 1) };
}

/** De dónde sale la descripción de cada área. null: la ruta no está (o no aplica: la exploración de un proyecto). */
function useDescripciones(id: string, version: number) {
  const [data, setData] = useState<DescripcionesDeLaEscala | null>(null);
  const [pedido, setPedido] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/sales/exploraciones/${id}/escala/descripcion`, { cache: "no-store", signal: ctrl.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as DescripcionesDeLaEscala) : null))
      .then((d) => setData(d && Array.isArray(d.areas) ? d : null))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [id, version, pedido]);
  return { data, otraVez: () => setPedido((n) => n + 1) };
}

/** El área de una pestaña que ya no está: la primera que ve el cliente con algo; si no, la primera con algo; si no, la primera. */
function areaDeEntrada(p: PaginaParaElCse): string | null {
  const conAlgo = (id: string) => (p.resultados.find((r) => r.areaId === id)?.preguntadas ?? 0) > 0;
  return p.alCliente.find(conAlgo) ?? p.areas.find((a) => conAlgo(a.id))?.id ?? p.alCliente[0] ?? p.areas[0]?.id ?? null;
}

const ORIGEN: Record<"agente" | "mano" | "respaldo", string> = {
  agente: "La escribió Nexus con lo explorado.",
  mano: "La escribió tu equipo: Nexus no la cambia sola.",
  respaldo: "Armada con los niveles, sin IA.",
};

/** El panel de una dimensión: para LEER lo interno (el detalle de siempre). Los textos se editan en la página. */
function PanelDeLaDimension({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const { escala } = useLienzo();
  const area = escala.areas.find((a) => a.dimensiones.some((d) => d.id === id));
  const d = area?.dimensiones.find((x) => x.id === id);
  if (!d) return null;
  return (
    <Drawer open onClose={onCerrar} title={d.nombre} description={`${area?.nombre ?? ""} · ${d.id} · lo interno: el cliente no lo ve`} size="lg">
      <DetalleDeDimension d={d} onCerrar={onCerrar} enPanel />
    </Drawer>
  );
}

/**
 * Arriba de la página, solo adentro: si el cliente ve el área elegida, cuánto tiene y «Sumar/Sacar … de la preventa» (lo
 * que en «Comparar áreas» dicen los botones de las áreas y el encabezado del área).
 */
function LineaDelArea({ areaId, alCliente }: { areaId: string; alCliente: boolean }) {
  const { exp, escala, mapa, cambiar, puedeEditar, guardando, lugar } = useLienzo();
  const area = escala.areas.find((a) => a.id === areaId);
  if (!area) return null;
  const calculo = chequeoDelMapa(escala, [area.id], mapa.posiciones).areas[0];
  const cuenta = calculo ? cuentaDelArea(calculo, mapa.posiciones) : null;
  const enJuego = exp.estado.areas.includes(area.id);
  const alternar = () => void cambiar([{ op: "areas", areas: enJuego ? exp.estado.areas.filter((a) => a !== area.id) : [...exp.estado.areas, area.id] }]);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-fg-muted">
      <span>
        <span className="font-semibold text-fg">{area.nombre}</span>
        {alCliente ? " · la ve el cliente" : " · el cliente no la ve: súmala en «Acceso» › «Qué equipos ve»"}
        {cuenta && ` · ${fraseDeLaCuenta(cuenta)}`}
        {!enJuego && ` · no está en juego ${DEL_LUGAR[lugar]}`}
      </span>
      {puedeEditar && (
        <button type="button" disabled={guardando} onClick={alternar} className="font-semibold text-fg-muted hover:text-fg hover:underline disabled:opacity-60">
          {enJuego ? `Sacar ${area.nombre} ${DEL_LUGAR[lugar]}` : `Sumar ${area.nombre} ${AL_LUGAR[lugar]}`}
        </button>
      )}
    </div>
  );
}

/**
 * «Contexto para la descripción» (Elías, 8 nov: lo lee el agente de la descripción, como el «Contexto adicional» de los
 * otros artefactos; el cliente NO lo ve). Un texto por área; al guardarlo ofrece rehacer la descripción con él.
 */
function ContextoParaLaDescripcion({ areaId, nombre, onRehacer, rehaciendo }: { areaId: string; nombre: string; onRehacer: () => void; rehaciendo: boolean }) {
  const { exp, cambiar, puedeEditar, guardando } = useLienzo();
  const guardado = exp.estado.contenido.contextoDeLaEscala?.[areaId] ?? "";
  const [borrador, setBorrador] = useState<{ de: string; texto: string } | null>(null);
  const [recienGuardado, setRecienGuardado] = useState(false);
  const texto = borrador?.de === areaId ? borrador.texto : guardado;
  const cambio = texto.trim() !== guardado;
  const guardar = async () => {
    if (await cambiar([{ op: "contextoDeLaEscala", areaId, texto: texto.trim() || null }])) {
      setBorrador(null);
      setRecienGuardado(true);
    }
  };
  if (!puedeEditar && !guardado) return null;
  return (
    <details className="group rounded-xl border border-line bg-surface" open={!!guardado || undefined}>
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 px-4 py-2.5 text-sm font-semibold text-fg">
        Contexto para la descripción de {nombre}
        <span className="text-xs font-normal text-fg-muted">lo lee el agente que escribe la descripción · no lo ve el cliente{guardado ? "" : " · vacío"}</span>
      </summary>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <Field label="Lo que el agente debe tener en cuenta" hint="Por ejemplo: con quién se habló, qué pesa más para esta empresa, qué evitar decir.">
          <Textarea
            value={texto}
            rows={3}
            maxLength={MAX_CONTEXTO_DE_LA_ESCALA}
            disabled={!puedeEditar}
            onChange={(e) => {
              setBorrador({ de: areaId, texto: e.target.value });
              setRecienGuardado(false);
            }}
          />
        </Field>
        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" disabled={guardando || !cambio} onClick={() => void guardar()}>
              Guardar
            </Button>
            {recienGuardado && !cambio && (
              <>
                <span className="text-xs text-fg-muted">Guardado. La descripción no cambia sola:</span>
                <Button size="sm" variant="secondary" loading={rehaciendo} onClick={onRehacer}>
                  Rehacer la descripción con IA
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Un texto fijo de la página, editable en su lugar (16 nov). Guardar el de siempre (o vaciarlo) lo devuelve al de
 * siempre; «Quitar para el cliente» deja la pieza fuera de la página (se ve tachada adentro, con «Volver a mostrarla»).
 */
function TextoFijo({ o, guardar }: { o: EdicionDeUnTextoFijo; guardar: (clave: string, texto: string | null) => Promise<boolean> }) {
  if (o.quitar?.quitada)
    return (
      <span className="rd-quitada">
        <s>{o.original}</s>{" "}
        <span className="rd-quitada-nota">
          No lo ve el cliente.{" "}
          <button type="button" className="rd-btn-enlace" onClick={() => void guardar(o.quitar!.clave, null)}>
            Volver a mostrarlo
          </button>
        </span>
      </span>
    );
  const cambiado = o.valor !== o.original;
  return (
    <TextoEditableDeLaPagina
      valor={o.valor}
      vacio="+ Escribir"
      max={MAX_TEXTO_DE_LA_PAGINA}
      etiqueta={o.etiqueta}
      quitar={cambiado ? "Volver al texto de siempre" : null}
      acciones={
        o.quitar
          ? () => (
              <button type="button" className="rd-btn-enlace" onClick={() => void guardar(o.quitar!.clave, "")}>
                Quitar para el cliente
              </button>
            )
          : undefined
      }
      onGuardar={(texto) => {
        const t = texto?.trim() ?? "";
        // Vacío o igual al de siempre: vuelve el de siempre (quitar una pieza es el botón, no borrar el texto).
        return guardar(o.clave, !t || t === o.original.trim() ? null : t);
      }}
    />
  );
}

/** El reloj de lo que lleva la corrida: un tic por segundo, solo mientras corre. */
function useAhora(activo: boolean): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    const t = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [activo]);
  return ahora;
}

/**
 * Arriba del Resumen, lo que hay que hacer con él (24 nov, Elías con TEC · AE). Qué dice lo decide `queDiceElAviso`
 * (lib/exploraciones/corrida-del-resumen.ts, con su prueba); acá solo se pinta: «Falta armar el Resumen» con su botón;
 * mientras Nexus lo arma, en qué va (la fase REAL) y cuánto lleva; si no se sabe en qué va o la corrida no late, cómo
 * seguir; si falló, por qué; con notas que el Resumen no leyó, «Rehacer con IA». Un solo botón de la IA a la vista: cuando
 * este aviso trae el suyo, la fila de abajo no repite «Rehacer con IA».
 */
function AvisoDelResumen({
  aviso,
  hayResumen,
  lanzando,
  puedeEditar,
  onArmar,
  onMirar,
  onCerrar,
}: {
  aviso: AvisoDelResumenEnPantalla;
  hayResumen: boolean;
  lanzando: boolean;
  puedeEditar: boolean;
  onArmar: () => void;
  onMirar: () => void;
  onCerrar: (id: string) => void;
}) {
  const ahora = useAhora(aviso?.tipo === "corriendo");
  if (!aviso) return null;
  const boton = (texto: string, alTocar: () => void, variante: "primary" | "secondary" = "primary") =>
    puedeEditar ? (
      <Button size="sm" variant={variante} loading={lanzando} disabled={lanzando} onClick={alTocar}>
        {texto}
      </Button>
    ) : undefined;
  switch (aviso.tipo) {
    case "corriendo":
      return (
        <Alert variant="info" title={hayResumen ? "Nexus está rehaciendo el Resumen" : "Nexus está armando el Resumen"}>
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Spinner size="xs" />
            <span>{aviso.fase}</span>
            {/* El reloj no se anuncia: el lector de pantalla lo leería cada segundo. Se anuncia la fase. */}
            {aviso.desde && (
              <span className="tabular-nums" aria-hidden="true">
                · lleva {cuantoLleva(aviso.desde, ahora)}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs">Tarda unos 3 minutos. Puedes seguir trabajando: si sales y vuelves, lo sigues viendo aquí.{hayResumen ? " Lo escrito a mano se queda." : ""}</span>
        </Alert>
      );
    case "sin-saber":
      return (
        <Alert variant="warning" title="No pudimos saber en qué va el Resumen" action={<Button size="sm" variant="secondary" onClick={onMirar}>Volver a mirar</Button>}>
          Se cortó la conexión con Nexus un buen rato. El Resumen puede seguir armándose: vuelve a mirar en un momento.
        </Alert>
      );
    case "detenida":
      return (
        <Alert variant="warning" title={`Nexus no da señales hace más de ${MINUTOS_SIN_LATIDO} minutos`} action={boton("Volver a intentar", onArmar)}>
          Puede haberse interrumpido (un reinicio del servidor). No se cambió nada{hayResumen ? ": el Resumen que ves sigue igual" : ""}.
        </Alert>
      );
    case "falta":
      return (
        <Alert variant="warning" title="Falta armar el Resumen" action={boton("Armar el Resumen con IA", onArmar)}>
          Es la portada del diagnóstico. Nexus la arma con lo que se habló en las reuniones (unos 3 minutos). Mientras no exista, el cliente no ve esta
          pestaña: su enlace abre en la página de un equipo.
          {aviso.fallo && <span className="mt-1 block font-medium">La última vez que se pidió, no se pudo. {aviso.fallo}</span>}
        </Alert>
      );
    case "fallo":
      return (
        <Alert variant="danger" title="No se pudo rehacer el Resumen" onDismiss={() => onCerrar(aviso.id)}>
          {aviso.error}
        </Alert>
      );
    case "nuevas":
      return (
        <Alert variant="info" title={aviso.titulo} action={boton("Rehacer con IA", onArmar)}>
          El Resumen las lee cuando lo rehaces. Lo escrito a mano se queda y nada se publica solo.
        </Alert>
      );
  }
}

export default function PaginaDeLaEscala() {
  const { exp, cambiar, puedeEditar, recargar, nombreDeNivel, guardando } = useLienzo();
  const toast = useToast();
  const { pagina, error, otraVez } = usePagina(exp.id, exp.version);
  const descripciones = useDescripciones(exp.id, exp.version);
  const [elegida, setElegida] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [rehaciendo, setRehaciendo] = useState(false);
  /** «Rehacer con IA» sobre una descripción escrita a mano: se pregunta antes de pisarla (16 nov). */
  const [pisarLaEscrita, setPisarLaEscrita] = useState(false);
  /** El historial de versiones del Resumen (21 nov, reemplaza a «Volver a la versión anterior»). */
  const [historialAbierto, setHistorialAbierto] = useState(false);
  /** El historial de la página del área elegida (23 nov). */
  const [historialDelArea, setHistorialDelArea] = useState(false);
  /* La corrida del Resumen (24 nov): sigue en el servidor y se mira por su fase. La comparten el botón y la cuenta
     regresiva de una nota (mientras rehace, tampoco se usa otra versión del historial; el servidor también frena); una
     que lanzó otra pestaña o que seguía al recargar, también se ve. */
  const {
    corrida: corridaDelResumen,
    terminada: terminadaDelResumen,
    sinSaber: sinSaberDelResumen,
    corriendo: armando,
    lanzando: lanzandoElResumen,
    armar: armarElResumen,
    mirar: mirarElResumen,
  } = useResumenEnCurso(exp.id);
  /** El fallo de rehacer que la persona cerró: no vuelve hasta otro (recordado en este navegador). */
  const [falloCerrado, setFalloCerrado] = useFalloCerrado(exp.id);
  /* Cuando termina una corrida que esta pantalla vio correr (la lanzara quien la lanzara), el lienzo y la página se ponen
     al día: el Resumen se guarda por su propia ruta y la primera edición no lo encontraría. */
  const vistaCorriendo = useRef<string | null>(null);
  useEffect(() => {
    if (!corridaDelResumen) return;
    if (corridaDelResumen.estado === "RUNNING") vistaCorriendo.current = corridaDelResumen.id;
    else if (vistaCorriendo.current === corridaDelResumen.id) {
      vistaCorriendo.current = null;
      if (corridaDelResumen.estado === "DONE") {
        void recargar();
        otraVez();
        avisarQueLaEscalaCambio();
      }
    }
  }, [corridaDelResumen, recargar, otraVez]);
  /** Lo que el agente escribió y no pasó la verificación la última vez que se armó (para revisarlo). */
  const [descartados, setDescartados] = useState<string[] | null>(null);
  /* El nivel que va a quedar mientras se arrastra, y después de soltar hasta que llega la página nueva: se guarda con la
     página contra la que se dibujó, así que la página nueva lo borra sola. */
  const [enVivo, setEnVivo] = useState<{ de: PaginaParaElCse | null; niveles: Record<string, Letra> }>({ de: null, niveles: {} });
  const marcar = useMarcarNivel();
  /* El Resumen que se armó en otra pantalla (otra pestaña, otra persona) llega con la página, no con el lienzo: sin
     ponerlo al día, la primera edición no lo encontraría. Corre una vez por cambio (las dependencias son booleanos). */
  const resumenEnLaPagina = !!pagina?.resumen.at;
  const resumenEnElLienzo = !!exp.estado.contenido.resumenDeLaEscala;
  useEffect(() => {
    if (resumenEnLaPagina && !resumenEnElLienzo) void recargar();
  }, [resumenEnLaPagina, resumenEnElLienzo, recargar]);
  // Lo que aplicó (o deshizo) Nexus desde su cajón: la página y las descripciones se vuelven a pedir.
  useEffect(() => {
    const alCambiar = () => {
      otraVez();
      descripciones.otraVez();
    };
    window.addEventListener(EVENTO_LA_ESCALA_CAMBIO_CON_NEXUS, alCambiar);
    return () => window.removeEventListener(EVENTO_LA_ESCALA_CAMBIO_CON_NEXUS, alCambiar);
  });

  if (!pagina)
    return error ? (
      <Alert variant="danger" title="No se pudo armar la página de la escala">
        {error}{" "}
        <button type="button" className="font-semibold underline" onClick={otraVez}>
          Volver a intentar
        </button>
      </Alert>
    ) : (
      <Skeleton className="h-[720px] w-full" rounded="lg" />
    );
  if (!pagina.resultados.length)
    return (
      <Alert variant="info" title="Esta escala todavía no tiene áreas">
        Cuando la escala tenga sus áreas, aquí se ve la página tal como la verá el cliente.
      </Alert>
    );
  // La página abre en el Resumen (9 nov), como la del cliente.
  const enElResumen = !elegida || elegida === PESTANA_DEL_RESUMEN;
  const areaId = !enElResumen && pagina.areas.some((a) => a.id === elegida) ? elegida : areaDeEntrada(pagina);
  const r = pagina.resultados.find((x) => x.areaId === areaId) ?? pagina.resultados[0];
  const pestanasDeLasAreas = pagina.areas.map((a) => ({ ...a, href: "#", oculta: !pagina.alCliente.includes(a.id) }));
  const elegir = (id: string) => {
    setElegida(id);
    setAbierta(null);
  };

  /* «✨ Mejorar con IA» (23 nov): las piezas de esta página, las mismas que lee el servidor (lib/exploraciones/escala-con-nexus.ts).
     Desde el 24 nov hay uno en el encabezado de cada sección que tiene algo que Nexus pueda cambiar (`mejorar`), además del
     de toda la página. Abre el cajón «Nexus» con el lugar y la sección como chip (HablarConNexus.tsx): la propuesta por
     pieza se ve allá, y al aplicarla la página se vuelve a pedir. */
  const lugarDeAqui: LugarEnLaEscala = enElResumen ? { pagina: "resumen" } : { pagina: "area", areaId: r.areaId };
  const nombreDeAqui = enElResumen ? "Resumen" : r.areaNombre;
  const piezasDeAqui: PiezaDeLaEscala[] = enElResumen
    ? piezasDelResumen(pagina.resumen, pagina.textos)
    : piezasDelArea(r, {
        textos: pagina.textos,
        textosDelRadar: exp.estado.contenido.textosDelRadar,
        descripcion: descripciones.data?.areas.find((a) => a.areaId === r.areaId)?.descripcion ?? null,
        detalle: (id) => pagina.detalles[id] ?? null,
        conLoQueCuesta: conLoQueCuestaDelArea(pagina.resumen, r.areaId),
        fecha: pagina.fecha,
      });
  const seccionesDeAqui = [...new Set(piezasDeAqui.map((p) => p.seccion))];
  const mejorar = puedeEditar
    ? (seccion: string) =>
        seccionesDeAqui.some((s) => esDeLaSeccion(s, seccion)) ? (
          <button
            type="button"
            className="rd-mejorar"
            aria-label={`Mejorar con IA la sección ${seccion}`}
            onClick={() => abrirNexusEnLaPreventa({ exploracionId: exp.id, escala: { lugar: lugarDeAqui, nombre: nombreDeAqui, foco: seccion } })}
          >
            {NOMBRE_DEL_BOTON}
          </button>
        ) : null
    : undefined;
  /** Lo que cambia la página por su propia ruta (el historial del área): el lienzo, la página y las descripciones al día. */
  const alCambiarLaPagina = () => {
    void recargar();
    otraVez();
    descripciones.otraVez();
  };
  const botonDePedirle =
    puedeEditar && piezasDeAqui.length ? (
      <Button size="sm" variant="secondary" onClick={() => abrirNexusEnLaPreventa({ exploracionId: exp.id, escala: { lugar: lugarDeAqui, nombre: nombreDeAqui, foco: null } })}>
        {NOMBRE_DEL_BOTON}
      </Button>
    ) : null;

  /** Guarda un texto fijo de la página (16 nov) y trae la página al día. */
  const guardarFijo = async (clave: string, texto: string | null) => {
    const ok = await cambiar([{ op: "textoDeLaPagina", clave, texto }]);
    if (ok) otraVez();
    return ok;
  };
  const fijo = puedeEditar ? (o: EdicionDeUnTextoFijo) => <TextoFijo o={o} guardar={guardarFijo} /> : undefined;

  if (enElResumen) {
    /* Desde el 24 nov la corrida sigue en el servidor y se espera por su fase (useResumenEnCurso): la pantalla ya no se
       queda colgada de una respuesta que nginx corta a los 10 minutos. Lo que falla se ve en el aviso de arriba. */
    const armar = async () => {
      setDescartados(null);
      const r = await armarElResumen();
      if (!r.ok) {
        // Si arrancó y terminó mal, el aviso de arriba dice por qué; si ni arrancó, se dice acá.
        if (!r.corrida) toast.error(r.error);
        return;
      }
      setDescartados(r.corrida.descartados);
      const n = r.corrida.descartados.length;
      toast.success(`Listo en ${cuantoLleva(r.corrida.empezo, Date.parse(r.corrida.termino ?? new Date().toISOString()))}.${n ? ` ${n === 1 ? "Una cosa no pasó" : `${n} cosas no pasaron`} la verificación.` : ""}`);
      // Ya estaba corriendo otra (otra pestaña, otra persona): lo que se sumó después de que empezó no entró.
      if (r.ajena) toast.info("Ya se estaba rehaciendo cuando lo pediste: si sumaste algo después, vuelve a rehacerlo.");
    };
    /* El historial de versiones (21 nov, lib/exploraciones/versiones-del-resumen-server.ts): usar una manda la huella de lo
       que ve; si otra persona o Nexus lo cambió entretanto, 409 y se carga lo último. Lo publicado no cambia. */
    const alCambiarDeVersion = () => {
      setDescartados(null);
      // El Resumen se guarda por su propia ruta: el lienzo y la página se ponen al día.
      void recargar();
      otraVez();
    };
    const res = pagina.resumen;
    const edicionDelResumen: EdicionDelResumen = {
      alElegir: elegir,
      texto: (o) =>
        puedeEditar && res.at ? (
          <TextoEditableDeLaPagina
            valor={o.valor}
            vacio={o.vacio}
            max={o.tope}
            etiqueta={o.etiqueta}
            quitar={o.quitar ?? null}
            onGuardar={async (texto) => {
              const ok = await cambiar([{ op: "resumenDeLaEscala", clave: o.clave, texto }]);
              if (ok) otraVez();
              return ok;
            }}
          />
        ) : (
          o.valor
        ),
      deDonde: (citas, d) => <DeDondeSale citas={citas} noSostiene={d?.noSostiene} />,
      fijo,
      mejorar,
      // Una cifra que dijo Smarteam y la empresa no corrigió (18 nov): «Confirmar» la deja como dicha por la empresa.
      confirmar:
        puedeEditar && res.at
          ? (clave) => (
              <button
                type="button"
                className="re-confirmar"
                onClick={async () => {
                  const ok = await cambiar([{ op: "resumenDeLaEscala", clave: `${clave}:confirmar`, texto: "si" }]);
                  if (ok) otraVez();
                }}
              >
                Confirmar
              </button>
            )
          : undefined,
    };
    // Las cifras que el cliente no ve (Elías, 9 nov): adentro salen marcadas, con el porqué, para corregirlas o quitarlas.
    // Con lo que cuesta (20 nov), que sale de las cifras para ir de titular.
    const cifras = res.tarjetas.flatMap((t) => t.subequipos.flatMap((x) => [...(x.costo ? [x.costo] : []), ...x.cifras]));
    const queNoSalen = cifras.filter((d) => d.noSale).length;
    const queSalen = cifras.length - queNoSalen;
    /* Lo que hay que saber del Resumen, solo si hay algo (24 nov, Elías: «demasiada información»). Se fueron «Resumen · lo
       primero que ve el cliente… Sale de los equipos que ve» y «Armado el … Cada texto se cambia con un clic»: cuándo se
       armó y si hay reuniones nuevas lo dice la línea de La escala (PasoEscala › `LineaDeLaUbicacion`, debajo de la
       página desde el 24 nov). Sin Resumen lo dice el aviso de arriba («Falta armar el Resumen», `AvisoDelResumen`). */
    const avisosDelResumen = [
      res.at && res.formato === 1 && "Está armado con el formato del 9 nov (datos rojos y hallazgos): «Rehacer con IA» lo pasa al resumen ejecutivo y conserva lo que escribiste.",
      res.at && res.formato === 2 && !cifras.length && "Ninguna cifra pasó la verificación: las tarjetas dicen qué dato falta.",
      queNoSalen > 0 &&
        (queSalen
          ? `${queNoSalen === 1 ? "Una cifra no sale" : `${queNoSalen} cifras no salen`} al cliente porque su cita no la sostiene: está marcada abajo.`
          : "Ninguna cifra sale al cliente: sus citas no las sostienen. Están marcadas abajo."),
    ].filter((x): x is string => !!x);
    /* Lo que se contó después de este Resumen (24 nov): las respuestas de «Para completar el diagnóstico» y las notas de
       «Lo que sabes del cliente» que llegaron después de que su corrida empezó a leer. */
    // Desde cuándo leyó: la corrida que lo armó (la última que terminó bien, si es la de este Resumen); si no, cuándo se armó.
    const laQueLoArmo = terminadaDelResumen && terminadaDelResumen.id === exp.estado.contenido.resumenDeLaEscala?.agentRunId ? { estado: "DONE", empezo: terminadaDelResumen.empezo } : null;
    const nuevas = res.at ? tituloDeLasNuevas(notasNuevasDesde(exp.estado.contenido.notas, exp.estado.contenido.autoresDeLasNotas, leidoHasta(res.at, laQueLoArmo))) : null;
    const aviso = queDiceElAviso({ resumenEn: res.at, corrida: corridaDelResumen, lanzando: lanzandoElResumen, sinSaber: sinSaberDelResumen, nuevas, cerrado: falloCerrado });
    // El aviso con su propio botón de la IA: la fila de abajo no lo repite («IA arriba, una sola vez»).
    const avisoConBoton = aviso?.tipo === "nuevas" || aviso?.tipo === "detenida";
    // Los equipos que ve el cliente, con su nivel: lo único con datos de la plantilla.
    const equiposDeLaPlantilla = pagina.alCliente.flatMap((id) => {
      const x = pagina.resultados.find((y) => y.areaId === id);
      return x ? [{ id, nombre: x.areaNombre, nivel: x.nivelNombre }] : [];
    });
    const pestanasDelResumen = [{ id: PESTANA_DEL_RESUMEN, nombre: "Resumen", href: "#" }, ...pestanasDeLasAreas];
    return (
      <div data-recorrido="preventa.escala.areas" className="flex flex-col gap-2">
        {/* La franja interna: lo que solo ve el equipo va acá, FUERA del marco que imita la página del cliente. */}
        <div className="flex flex-col gap-2 text-xs text-fg-muted">
          {/* Lo que hay que hacer con el Resumen, a la vista (24 nov): armarlo, en qué va, por qué falló o lo nuevo. */}
          <AvisoDelResumen
            aviso={aviso}
            hayResumen={!!res.at}
            lanzando={lanzandoElResumen}
            puedeEditar={puedeEditar}
            onArmar={() => void armar()}
            onMirar={() => void mirarElResumen()}
            onCerrar={setFalloCerrado}
          />
          {res.at && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="min-w-0 flex-1">{avisosDelResumen.join(" ")}</p>
              {puedeEditar && (
                <div className="flex flex-wrap items-center gap-2">
                  {botonDePedirle}
                  <BotonDelHistorial onClick={() => setHistorialAbierto(true)} />
                  {!avisoConBoton && (
                    <Button size="sm" variant="secondary" loading={armando} disabled={armando} onClick={() => void armar()}>
                      Rehacer con IA
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          {/* La escala cambió desde que se armó (compara la firma de los niveles): el Resumen puede decir algo viejo. */}
          {res.at && res.escalaCambio && (
            <Alert variant="warning" title="La escala cambió desde este resumen">
              Los niveles se movieron después de armarlo. Revisa lo que dice o rehazlo con IA.
            </Alert>
          )}
          {res.malLeidas && res.malLeidas.length > 0 && <ReunionesMalLeidas reuniones={res.malLeidas} enteras={!!res.leidasEnteras} />}
          {res.avisos && res.avisos.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-warn-ink">
              {res.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          {descartados && descartados.length > 0 && (
            <details>
              <summary className="cursor-pointer font-semibold text-fg-secondary">Lo que Nexus escribió y no pasó la verificación ({descartados.length})</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {descartados.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        {error && (
          <Alert variant="warning" title="No se pudo traer la página al día">
            Lo que guardaste quedó guardado; esta vista puede estar atrasada.{" "}
            <button type="button" className="font-semibold underline" onClick={otraVez}>
              Volver a intentar
            </button>
          </Alert>
        )}
        <HistorialDelResumen
          open={historialAbierto}
          onClose={() => setHistorialAbierto(false)}
          exploracionId={exp.id}
          empresa={pagina.empresa}
          paginaDeHoy={pagina}
          puedeEditar={puedeEditar}
          // Con un texto guardándose, la huella sería de lo de antes y el servidor diría que otra persona lo cambió.
          frenado={armando ? "Nexus está rehaciendo el Resumen: espera a que termine para usar otra versión." : guardando ? "Se está guardando un texto: espera un momento." : null}
          alCambiar={alCambiarDeVersion}
        />
        <div className="overflow-hidden rounded-xl border border-line">
          {/* Sin Resumen, la plantilla (24 nov): la forma de la portada, sin texto inventado. El cliente no ve esta pestaña. */}
          {res.at ? (
            <ResumenDeLaEscalaVista
              resumen={res}
              empresa={pagina.empresa}
              dominio={pagina.dominio}
              logo={pagina.logo}
              fecha={pagina.fecha}
              pestanas={pestanasDelResumen}
              edicion={edicionDelResumen}
              textos={pagina.textos}
            />
          ) : (
            <PlantillaDelResumenVista empresa={pagina.empresa || pagina.dominio || ""} pestanas={pestanasDelResumen} alElegir={elegir} equipos={equiposDeLaPlantilla} />
          )}
        </div>
      </div>
    );
  }

  const nivelesEnVivo = enVivo.de === pagina ? enVivo.niveles : {};
  const descripcion = descripciones.data?.areas.find((a) => a.areaId === r.areaId)?.descripcion ?? null;
  const textos = exp.estado.contenido.textosDelRadar;
  const anotado = exp.estado.propuesta.tarjetasDeLaEscala?.porDimension ?? {};

  /** Escribe (PUT) o rehace con IA (POST) la descripción, por la ruta de la descripción. */
  const escribirDescripcion = async (texto: string | null, rehacer = false): Promise<boolean> => {
    const res = await fetch(`/api/sales/exploraciones/${exp.id}/escala/descripcion`, {
      method: rehacer ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rehacer ? { areaId: r.areaId } : { areaId: r.areaId, texto }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as (DescripcionesDeLaEscala & { error?: string }) | undefined;
    if (!res?.ok) {
      toast.error(data?.error ?? "No se pudo guardar la descripción.");
      return false;
    }
    const motivos = data?.descartadas?.find((x) => x.areaId === r.areaId)?.motivos ?? [];
    if (motivos.length) toast.error(`La descripción nueva no quedó: ${motivos.join(" · ")}`);
    // La descripción se guarda en la exploración por su propia ruta: el lienzo se pone al día para no chocar después.
    await recargar();
    descripciones.otraVez();
    otraVez();
    return true;
  };
  const rehacerYa = () => {
    setPisarLaEscrita(false);
    setRehaciendo(true);
    void escribirDescripcion(null, true).finally(() => setRehaciendo(false));
  };
  // Lo escrito a mano no se pisa sin preguntar (16 nov): antes «Rehacer con IA» lo reemplazaba sin aviso.
  const rehacer = () => (descripcion?.origen === "mano" ? setPisarLaEscrita(true) : rehacerYa());

  const edicion: EdicionDeLaPagina = {
    alElegirArea: elegir,
    descripcion:
      puedeEditar && descripcion ? (
        <TextoEditableDeLaPagina
          valor={r.sintesis ?? null}
          vacio="+ Escribir la descripción"
          max={TOPE_DE_LA_DESCRIPCION}
          etiqueta="Descripción de «Resultado general»"
          quitar={descripcion.origen === "mano" ? "Quitar lo escrito" : null}
          origen={
            <>
              {ORIGEN[descripcion.origen]}
              {!descripcion.vigente && descripcion.origen !== "respaldo" && " Los niveles cambiaron desde que se escribió."}{" "}
              <button type="button" className="rd-btn-enlace" disabled={rehaciendo} onClick={rehacer}>
                {rehaciendo ? "Nexus está escribiendo…" : "Rehacer con IA"}
              </button>
            </>
          }
          onGuardar={(texto) => escribirDescripcion(texto)}
        />
      ) : undefined,
    textoDeLaTarjeta: puedeEditar
      ? (id, actual) => {
          const d = r.dimensiones.find((x) => x.id === id);
          if (!d?.nivel) return null;
          const nivel = d.nivel;
          const escrito = textos?.[id] ?? null;
          const vigente = textoVigenteDelRadar(textos, d) !== null;
          const deNexus = anotado[id]?.comoEsta ?? null;
          return (
            <TextoEditableDeLaPagina
              valor={actual}
              vacio="+ Escribir qué le pasa al área en esta parte"
              max={MAX_TEXTO_DEL_RADAR}
              etiqueta={`Lo que dice la tarjeta de ${d.nombre}`}
              quitar={vigente ? "Volver al texto de la escala" : null}
              acciones={(poner) => (
                <>
                  {deNexus && (
                    <button type="button" className="rd-btn-enlace" title={deNexus} onClick={() => poner(deNexus)}>
                      Usar lo que anotó Nexus
                    </button>
                  )}
                  {escrito && !vigente && (
                    <button type="button" className="rd-btn-enlace" onClick={() => poner(escrito.texto)}>
                      Usar tu texto de {nombreDeNivel(escrito.nivel)}
                    </button>
                  )}
                </>
              )}
              onGuardar={(texto) => cambiar([{ op: "textoDelRadar", dimensionId: id, valor: texto ? { texto, nivel } : null }])}
            />
          );
        }
      : undefined,
    radar: (radar) => (
      <ArrastreDelRadar
        activo={puedeEditar}
        onTocar={setAbierta}
        onMover={(clave, letra) => setEnVivo({ de: pagina, niveles: letra ? { [clave]: letra } : {} })}
        onSoltar={(clave, letra) => {
          setEnVivo({ de: pagina, niveles: { [clave]: letra } });
          // Sin cambio (el mismo nivel) o con error, la página no se vuelve a pedir: se suelta acá.
          void marcar(clave, letra).then((ok) => {
            if (!ok) setEnVivo({ de: null, niveles: {} });
          });
        }}
      >
        {/* El ancla del recorrido «Dónde está cada dimensión». */}
        <div data-recorrido="preventa.escala.dimensiones">{radar}</div>
      </ArrastreDelRadar>
    ),
    nivelesEnVivo,
    pieDeLaTarjeta: (id) => {
      const d = r.dimensiones.find((x) => x.id === id);
      return (
        <div className="rd-tip-pie">
          <span>{d && textoVigenteDelRadar(textos, d) ? "Texto de tu equipo · " : ""}Solo lo ves tú:</span>
          <button type="button" onClick={() => setAbierta(id)}>
            Ver lo interno
          </button>
        </div>
      );
    },
    ayudaDelRadar: puedeEditar
      ? "Así lo ve el cliente. Arrastra una parte por su eje para cambiar su nivel; en su tarjeta, toca el texto para cambiarlo. Tócala en el radar para ver lo interno."
      : "Así lo ve el cliente. Toca una parte para ver lo interno.",
    fijo,
    mejorar,
  };

  return (
    <div data-recorrido="preventa.escala.areas" className="flex flex-col gap-2">
      <LineaDelArea areaId={r.areaId} alCliente={pagina.alCliente.includes(r.areaId)} />
      {puedeEditar && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <BotonDelHistorial onClick={() => setHistorialDelArea(true)} />
          {botonDePedirle}
        </div>
      )}
      <HistorialDelArea
        open={historialDelArea}
        onClose={() => setHistorialDelArea(false)}
        exploracionId={exp.id}
        areaId={r.areaId}
        areaNombre={r.areaNombre}
        empresa={pagina.empresa}
        puedeEditar={puedeEditar}
        alCambiar={alCambiarLaPagina}
      />
      {descripciones.data && <ContextoParaLaDescripcion areaId={r.areaId} nombre={r.areaNombre} onRehacer={rehacer} rehaciendo={rehaciendo} />}
      {error && (
        <Alert variant="warning" title="No se pudo traer la página al día">
          Lo que guardaste quedó guardado; esta vista puede estar atrasada.{" "}
          <button type="button" className="font-semibold underline" onClick={otraVez}>
            Volver a intentar
          </button>
        </Alert>
      )}
        <div className="overflow-hidden rounded-xl border border-line">
        <ResultadoDelTestVista
          r={r}
          empresa={pagina.empresa}
          dominio={pagina.dominio}
          fecha={pagina.fecha}
          agenda=""
          detalles={pagina.detalles}
          dimensionDelRiesgo={pagina.dimensionDelRiesgo}
          logo={pagina.logo}
          deLaEscala={{
            areas: pestanasDeLasAreas,
            porExplorar: pagina.porExplorar[r.areaId] ?? [],
            resumen: { href: "#" },
            textos: pagina.textos,
            // Lo que más le cuesta al área (20 nov): su tarjeta del Resumen.
            tarjeta: pagina.resumen.tarjetas.find((t) => t.areaId === r.areaId) ?? null,
          }}
          edicion={edicion}
        />
        </div>
      {abierta && <PanelDeLaDimension key={abierta} id={abierta} onCerrar={() => setAbierta(null)} />}
      <ConfirmDialog
        open={pisarLaEscrita}
        onCancel={() => setPisarLaEscrita(false)}
        onConfirm={rehacerYa}
        title="¿Reemplazar la descripción que escribió tu equipo?"
        description={`Nexus va a escribir una nueva para ${r.areaNombre} y la tuya se pierde.`}
        confirmLabel="Sí, reemplazarla"
        variant="destructive"
      />
    </div>
  );
}
