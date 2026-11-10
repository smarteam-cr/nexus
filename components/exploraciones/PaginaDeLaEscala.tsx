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
 *     (la operación `resumenDeLaEscala`); debajo de cada dato rojo y cada hallazgo, de dónde sale (solo adentro);
 *   · las pestañas de los departamentos son las de la página, con todas las áreas: la que el cliente no ve va punteada
 *     y dice «no la ve el cliente» (se elige en «Acceso» › «Qué equipos ve»);
 *   · la descripción de «Resultado general» se edita donde está y se rehace con IA (la guarda y la genera
 *     /api/sales/exploraciones/[id]/escala/descripcion, de la sesión que hizo la descripción: acá no se genera nada);
 *   · lo que dice la tarjeta de cada dimensión se edita dentro de la tarjeta (`textoDelRadar`, solo para el nivel en que
 *     se escribió: `textoVigenteDelRadar`), con «Usar lo que anotó Nexus» si lo hay;
 *   · en el radar, cada dimensión se ARRASTRA por su eje para cambiar su nivel (components/escala/ArrastreDelRadar.tsx;
 *     escribe por `useMarcarNivel`, lo mismo que los cinco niveles del detalle). Tocarla abre su panel, que es para LEER
 *     lo interno (evidencia o hipótesis, qué preguntar, «Llevar a la sesión N», los niveles): ahí no se edita texto.
 * Arriba de la página, fuera de ella: la línea del área (si la ve el cliente, cuánto tiene, sumarla o sacarla) y el
 * «Contexto para la descripción», que lee el agente de la descripción y NO ve el cliente (`contextoDeLaEscala`).
 * Todo se guarda en la exploración; la página se vuelve a pedir cuando cambia su versión. Lo que propone el agente y nadie
 * usó NO se dibuja: el cliente no lo ve. Para eso están la franja de sugerencias y la vista «Comparar áreas».
 */
import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Field, Skeleton, Textarea, useToast } from "@/components/ui";
import ArrastreDelRadar from "@/components/escala/ArrastreDelRadar";
import { PESTANA_DEL_RESUMEN } from "@/components/external/test/ArribaDeLaEscala";
import ResultadoDelTestVista, { type EdicionDeLaPagina } from "@/components/external/test/ResultadoDelTestVista";
import ResumenDeLaEscalaVista, { type EdicionDelResumen } from "@/components/external/test/ResumenDeLaEscalaVista";
import TextoEditableDeLaPagina from "@/components/external/test/TextoEditableDeLaPagina";
import type { Letra } from "@/lib/escala/documento/tipos";
import { MAX_CONTEXTO_DE_LA_ESCALA, MAX_TEXTO_DEL_RADAR } from "@/lib/exploraciones/contenido";
import { textoVigenteDelRadar } from "@/lib/exploraciones/escala-para-el-cliente";
import type { PaginaParaElCse } from "@/lib/exploraciones/escala-para-el-cliente-server";
import { diaCorto } from "@/lib/exploraciones/fechas";
import type { CitaDelResumen } from "@/lib/exploraciones/resumen-de-la-escala";
import { chequeoDelMapa, cuentaDelArea, fraseDeLaCuenta } from "@/lib/exploraciones/mapa";
import { AL_LUGAR, DEL_LUGAR, useLienzo } from "./contexto";
import { DetalleDeDimension, useMarcarNivel } from "./DetalleDeLaDimension";

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
 * De dónde sale un dato rojo o un hallazgo: lo dicho, quién y cuándo (y quién lo confirmó). Solo adentro. `noSostiene`:
 * la cifra se cambió a mano y la cita ya no la dice (la cita queda para corregirla con lo que dijo la empresa).
 */
function DeDondeSale({ citas, noSostiene = false }: { citas: readonly CitaDelResumen[]; noSostiene?: boolean }) {
  if (!citas.length) return <p className="rs-citas-k">Lo escribió tu equipo: no tiene cita.</p>;
  return (
    <div className="rs-citas">
      <p className="rs-citas-k">{noSostiene ? "Solo lo ves tú · la cita que tenía (no dice esta cifra):" : "Solo lo ves tú · de dónde sale:"}</p>
      <ul>
        {citas.map((c) => (
          <li key={`${c.reunion}-${c.turno}`}>
            «{c.texto}» <span>— {c.hablante}, {diaCorto(c.fecha)}</span>
            {c.confirmo && <span> · lo confirmó {c.confirmo.hablante}: «{c.confirmo.texto}»</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lo que responde la ruta del Resumen al armarlo. */
interface ResumenArmado {
  descartados?: string[];
  segundos?: number;
  error?: string;
}

export default function PaginaDeLaEscala() {
  const { exp, cambiar, puedeEditar, recargar, nombreDeNivel } = useLienzo();
  const toast = useToast();
  const { pagina, error, otraVez } = usePagina(exp.id, exp.version);
  const descripciones = useDescripciones(exp.id, exp.version);
  const [elegida, setElegida] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [rehaciendo, setRehaciendo] = useState(false);
  const [armando, setArmando] = useState(false);
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

  if (enElResumen) {
    const armar = async () => {
      setArmando(true);
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/escala/resumen`, { method: "POST" }).catch(() => null);
      const data = ((await res?.json().catch(() => ({}))) ?? {}) as ResumenArmado;
      setArmando(false);
      if (!res?.ok) {
        toast.error(data.error ?? "No se pudo armar el Resumen.");
        return;
      }
      setDescartados(data.descartados ?? []);
      // El Resumen se guarda por su propia ruta: el lienzo se pone al día, o la primera edición no lo encontraría.
      await recargar();
      toast.success(`Listo en ${data.segundos ?? 0} s.${data.descartados?.length ? ` ${data.descartados.length} cosas no pasaron la verificación.` : ""}`);
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
    };
    // Las cifras que el cliente no ve (Elías, 9 nov): adentro salen marcadas, con el porqué, para corregirlas o quitarlas.
    const queNoSalen = res.datosRojos.filter((d) => d.noSale).length;
    const queSalen = res.datosRojos.length - queNoSalen;
    return (
      <div data-recorrido="preventa.escala.areas" className="flex flex-col gap-2">
        {/* La franja interna: lo que solo ve el equipo va acá, FUERA del marco que imita la página del cliente. */}
        <div className="flex flex-col gap-2 text-xs text-fg-muted">
          <p>
            <span className="font-semibold text-fg">Resumen</span> · lo primero que ve el cliente al abrir el enlace. Sale de los equipos que ve:{" "}
            {pagina.areas.filter((a) => pagina.alCliente.includes(a.id)).map((a) => a.nombre).join(" · ") || "ninguno todavía (elígelos en «Acceso»)"}.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="min-w-0 flex-1">
              {res.at
                ? `Armado el ${diaCorto(res.at)} con lo que se habló en las sesiones. Cada texto se cambia con un clic; lo que escribas se queda al rehacerlo.`
                : "Todavía no hay Resumen: Nexus lo arma con las transcripciones de las sesiones (tarda alrededor de un minuto). Sin él, el cliente ve solo «Dónde quedan»."}
              {res.at && !res.datosRojos.length && " Ninguna cifra de pérdida pasó la verificación: los datos rojos no salen."}
              {queNoSalen > 0 &&
                (queSalen
                  ? ` ${queNoSalen === 1 ? "Una cifra no sale" : `${queNoSalen} cifras no salen`} al cliente porque su cita no la sostiene: está marcada abajo.`
                  : " Ninguna cifra sale al cliente: sus citas no las sostienen. Están marcadas abajo.")}
            </p>
            {puedeEditar && (
              <Button size="sm" variant={res.at ? "secondary" : "primary"} loading={armando} onClick={() => void armar()}>
                {armando ? "Nexus está leyendo las reuniones…" : res.at ? "Rehacer con IA" : "Armar el Resumen con IA"}
              </Button>
            )}
          </div>
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
        <div className="overflow-hidden rounded-xl border border-line">
          <ResumenDeLaEscalaVista
            resumen={res}
            empresa={pagina.empresa}
            dominio={pagina.dominio}
            fecha={pagina.fecha}
            pestanas={[{ id: PESTANA_DEL_RESUMEN, nombre: "Resumen", href: "#" }, ...pestanasDeLasAreas]}
            edicion={edicionDelResumen}
          />
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
  const rehacer = () => {
    setRehaciendo(true);
    void escribirDescripcion(null, true).finally(() => setRehaciendo(false));
  };

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
  };

  return (
    <div data-recorrido="preventa.escala.areas" className="flex flex-col gap-2">
      <LineaDelArea areaId={r.areaId} alCliente={pagina.alCliente.includes(r.areaId)} />
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
          deLaEscala={{
            areas: pestanasDeLasAreas,
            porExplorar: pagina.porExplorar[r.areaId] ?? [],
            resumen: { href: "#" },
          }}
          edicion={edicion}
        />
      </div>
      {abierta && <PanelDeLaDimension key={abierta} id={abierta} onCerrar={() => setAbierta(null)} />}
    </div>
  );
}
