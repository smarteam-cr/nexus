"use client";

/**
 * components/clients/FichaDelCliente.tsx — la ficha del cliente (lib/clients/ficha.ts).
 *
 * Un formulario, no un canvas: cada campo es un texto con formato mínimo («- » viñetas,
 * **negrita**) que el CSE edita, y un solo botón que CONFIRMA y escribe en HubSpot. Si la IA dejó
 * una propuesta, ocupa el lugar del campo que cambiaría —en azul, con la chispa, pintada como va a
 * quedar— con «Usar» y «Descartar»: la IA propone, el CSE confirma — nada llega a HubSpot sin ese
 * botón.
 *
 * «Resultados que persigue» no es un texto (2026-10-05): son las listas de resultados medibles de los
 * proyectos del cliente (ResultadosMediblesDelHandoff), que se editan y confirman acá mismo. El
 * texto que va a HubSpot lo arma el servidor con lo confirmado; la pantalla lo recibe en cada
 * respuesta y lo pone en el borrador, así «Confirmar» se enciende cuando cambió.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CAMPOS_DE_LA_FICHA,
  CAMPOS_QUE_PROPONE_LA_IA,
  EVENTO_FICHA_CAMBIO,
  GRUPOS_DE_FICHA,
  OPCIONES_DE_APERTURA,
  camposQueCambiaron,
  conservarLoEscrito,
  etiquetaDeApertura,
  valoresVacios,
  type CampoDeFicha,
  type ClaveDeFicha,
  type FichaGuardada,
  type ValoresDeFicha,
} from "@/lib/clients/ficha";
import { BotonAzul, BotonBlanco, BotonTexto, FranjaDeSugerencias, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { Alert } from "@/components/ui";
import { useMe } from "@/hooks/useMe";
import { TextoConFormato } from "./TextoConFormato";
import ResultadosMediblesDelHandoff from "./ResultadosMediblesDelHandoff";

interface ProyectoConResultados {
  projectId: string;
  proyecto: string;
}

interface Respuesta {
  ficha: FichaGuardada;
  hubspotUrl: string | null;
  /** Los proyectos del cliente con lista de resultados (los muestra «Resultados que persigue»). */
  proyectosConResultados?: ProyectoConResultados[];
  /** El texto que sale de los resultados confirmados (vacío si no hay ninguno). */
  resultadosParaLaFicha?: string;
  sinCambios?: boolean;
  error?: string;
}

/** El valor de «Resultados que persigue» en el borrador: lo confirmado de los proyectos, o lo que había. */
function conResultados(valores: ValoresDeFicha, deLosProyectos: string | undefined): ValoresDeFicha {
  return deLosProyectos ? { ...valores, resultadosQuePersigue: deLosProyectos } : valores;
}

function fecha(iso: string | null | undefined): string {
  if (!iso) return "";
  // Intl mete espacios finos distintos en Node y en Chrome: se normalizan (sin error de hidratación).
  return new Date(iso)
    .toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" })
    .replace(/[\u00a0\u202f]/g, " ");
}

export default function FichaDelCliente({ clientId }: { clientId: string }) {
  const [ficha, setFicha] = useState<FichaGuardada | null>(null);
  const [hubspotUrl, setHubspotUrl] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<ValoresDeFicha>(valoresVacios());
  const [descartadas, setDescartadas] = useState<Set<ClaveDeFicha>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [proyectos, setProyectos] = useState<ProyectoConResultados[]>([]);
  const me = useMe();
  const puedeEditarResultados = me?.capabilities.includes("handoffAnywhere") ?? false;
  const puedeConfirmarResultados = me?.permissions?.sections?.handoff?.confirmarResultados === true;
  /* Los campos descartados que ya se mandaron. Cada «Descartar» manda TODOS: si dos pedidos se cruzan
     en el servidor (cada uno lee la ficha y la guarda entera), el último igual lleva los dos. */
  const descartesEnviados = useRef<Set<ClaveDeFicha>>(new Set());
  /* Lo que hay en pantalla AHORA, para los callbacks que vuelven tarde (la IA tarda hasta un minuto):
     el `borrador` del closure es el del clic y se perdía lo escrito mientras se esperaba. */
  const borradorRef = useRef(borrador);
  useEffect(() => {
    borradorRef.current = borrador;
  }, [borrador]);

  const aplicar = useCallback(
    (r: { ficha: FichaGuardada; hubspotUrl?: string | null; proyectosConResultados?: ProyectoConResultados[]; resultadosParaLaFicha?: string }) => {
    setFicha(r.ficha);
    if (r.hubspotUrl !== undefined) setHubspotUrl(r.hubspotUrl);
    if (r.proyectosConResultados) setProyectos(r.proyectosConResultados);
    setBorrador(conResultados(r.ficha.valores, r.resultadosParaLaFicha));
    setDescartadas(new Set());
    descartesEnviados.current = new Set();
    // El aviso de la pestaña «Información del cliente» cuenta los campos por revisar.
    window.dispatchEvent(new CustomEvent(EVENTO_FICHA_CAMBIO, { detail: { clientId } }));
    },
    [clientId],
  );

  async function actualizarConIA() {
    const valoresAlClic = ficha?.valores ?? null;
    setLeyendo(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/ficha/proponer`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as {
        ficha?: FichaGuardada;
        cambiados?: number;
        sinFuentes?: boolean;
        error?: string;
      };
      if (!r.ok || !j.ficha) {
        setError(j.error ?? "No se pudo actualizar la ficha con IA.");
        return;
      }
      /* Lo que el CSE escribió sin confirmar —antes del clic o MIENTRAS esperaba— no se pierde: se
         compara lo que hay en pantalla ahora contra la ficha del momento del clic y eso se conserva
         sobre la ficha nueva. Guarda: lib/clients/ficha.test.ts › conservarLoEscrito. */
      const actual = borradorRef.current;
      // Lo de los resultados que estaba en el borrador vuelve con conservarLoEscrito (difiere de lo confirmado).
      aplicar({ ficha: j.ficha });
      setBorrador((b) => conservarLoEscrito(valoresAlClic, actual, b));
      setAviso(
        j.sinFuentes
          ? "No hay handoff, encuestas ni sesiones de dónde sacar información."
          : j.cambiados
            ? `La IA propone cambios en ${j.cambiados} ${j.cambiados === 1 ? "campo" : "campos"}. Revísalos abajo.`
            : "La IA leyó todo y no encontró nada nuevo para la ficha.",
      );
    } catch {
      setError("No se pudo actualizar la ficha con IA. Revisa tu conexión y vuelve a intentar.");
    } finally {
      setLeyendo(false);
    }
  }

  useEffect(() => {
    let vivo = true;
    fetch(`/api/clients/${clientId}/ficha`)
      .then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => ({}))) as Respuesta }))
      .then(({ ok, j }) => {
        if (!vivo) return;
        if (!ok) setError(j.error ?? "No se pudo cargar la ficha.");
        else aplicar(j);
      })
      .catch(() => vivo && setError("No se pudo cargar la ficha."))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [clientId, aplicar]);

  const cambios = useMemo(() => (ficha ? camposQueCambiaron(ficha.valores, borrador) : []), [ficha, borrador]);

  /* Se editó, confirmó o releyó una lista de resultados: se pide el texto nuevo que saldría de lo
     confirmado y se pone en el borrador (nada más: lo escrito en los otros campos sigue ahí). */
  const refrescarResultados = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/ficha`).catch(() => null);
    const j = (await r?.json().catch(() => null)) as Respuesta | null;
    if (!r?.ok || !j?.ficha) return;
    if (j.proyectosConResultados) setProyectos(j.proyectosConResultados);
    setBorrador((b) => ({ ...b, resultadosQuePersigue: j.resultadosParaLaFicha || j.ficha.valores.resultadosQuePersigue }));
  }, [clientId]);

  /** Lo que la IA propone y todavía difiere de lo que hay en pantalla. */
  const propuestas = useMemo(() => {
    const p = ficha?.propuesta?.valores ?? {};
    return CAMPOS_QUE_PROPONE_LA_IA.filter((c) => {
      const v = p[c.clave];
      return typeof v === "string" && v.trim() && v.trim() !== borrador[c.clave].trim() && !descartadas.has(c.clave);
    }).map((c) => c.clave);
  }, [ficha, borrador, descartadas]);

  const hubspotPendiente = !!ficha?.confirmadaAt && ficha.hubspot?.estado !== "sincronizada" && ficha.hubspot?.estado !== "sin_empresa";

  async function enviar(body: object) {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/ficha`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as Respuesta;
      if (!r.ok) {
        setError(j.error ?? "No se pudo guardar la ficha.");
        return;
      }
      aplicar(j);
      if (j.sinCambios) setAviso("No había cambios: la ficha ya estaba al día.");
    } catch {
      setError("No se pudo guardar la ficha. Revisa tu conexión y vuelve a intentar.");
    } finally {
      setGuardando(false);
    }
  }

  /* «Descartar» de UN campo: se ve al instante y se guarda. Sin guardarlo, el número de la pestaña
     no se apagaba nunca y la propuesta reaparecía al volver. No toca el borrador: lo que el CSE
     escribió en otros campos sigue ahí. */
  async function descartarCampo(clave: ClaveDeFicha) {
    setDescartadas((d) => new Set(d).add(clave));
    descartesEnviados.current.add(clave);
    const todos = [...descartesEnviados.current];
    try {
      const r = await fetch(`/api/clients/${clientId}/ficha`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descartarCampos: todos }),
      });
      const j = (await r.json().catch(() => ({}))) as Respuesta;
      if (!r.ok || !j.ficha) throw new Error(j.error ?? "");
      /* Solo la propuesta: si alguien confirmó valores desde otro lado, tomarlos acá sin re-sembrar el
         borrador los mostraría como «cambios» del CSE. Eso lo resuelve la próxima carga. */
      const propuesta = j.ficha.propuesta;
      setFicha((f) => (f ? { ...f, propuesta } : j.ficha));
      window.dispatchEvent(new CustomEvent(EVENTO_FICHA_CAMBIO, { detail: { clientId } }));
    } catch {
      descartesEnviados.current.delete(clave);
      setDescartadas((d) => {
        const n = new Set(d);
        n.delete(clave);
        return n;
      });
      setError("No se pudo descartar la propuesta de ese campo. Vuelve a intentar.");
    }
  }

  if (cargando) return <div className="h-40 rounded-xl border border-line" />;
  if (!ficha) return <p className="text-sm text-danger-ink">{error ?? "No se pudo cargar la ficha."}</p>;

  const set = (clave: ClaveDeFicha, valor: string) => setBorrador((b) => ({ ...b, [clave]: valor }));
  const usarTodas = () =>
    setBorrador((b) => {
      const n = { ...b };
      for (const k of propuestas) n[k] = ficha.propuesta!.valores[k]!;
      return n;
    });

  /** Lleva la vista al primer campo con propuesta («Revisar uno por uno»). */
  const irALaPrimera = () =>
    document.getElementById(`campo-${propuestas[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  /* Un solo botón azul a la vez: con propuestas por revisar, el azul es «Usar»; cuando no queda
     ninguna y hay algo que confirmar, pasa a «Confirmar y guardar en HubSpot». */
  const hayQueConfirmar = cambios.length > 0 || hubspotPendiente;
  const BotonConfirmar = hayQueConfirmar && propuestas.length === 0 ? BotonAzul : BotonBlanco;

  return (
    <div className="space-y-5 pb-24">
      {propuestas.length > 0 && ficha.propuesta && (
        <div data-recorrido="info.sugerencias">
        <FranjaDeSugerencias
          acciones={
            <>
              <BotonTexto disabled={guardando} onClick={() => void enviar({ descartarPropuesta: true })}>
                Descartar todo
              </BotonTexto>
              <BotonBlanco onClick={irALaPrimera}>Revisar uno por uno</BotonBlanco>
              <BotonAzul onClick={usarTodas}>Usar {propuestas.length === 1 ? "la propuesta" : `las ${propuestas.length}`}</BotonAzul>
            </>
          }
        >
          <strong className="font-semibold">
            La IA propone cambios en {propuestas.length} {propuestas.length === 1 ? "campo" : "campos"}
          </strong>
          {ficha.propuesta.fuentes.length > 0
            ? ` con lo que leyó de ${ficha.propuesta.fuentes.length === 1 ? ficha.propuesta.fuentes[0] : `${ficha.propuesta.fuentes.length} fuentes`}.`
            : "."}{" "}
          Nada llega a HubSpot hasta que confirmes la ficha.
        </FranjaDeSugerencias>
        </div>
      )}

      <EstadoDeLaFicha ficha={ficha} hubspotUrl={hubspotUrl} />

      <div data-recorrido="info.actualizar" className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-xs text-fg-muted">
          Se alimenta sola con el handoff y con cada sesión con el cliente; tú confirmas. En los textos, «- » al
          inicio de la línea arma viñetas y **así** queda en negrita.
        </p>
        <BotonBlanco
          disabled={leyendo || guardando}
          onClick={() => void actualizarConIA()}
          title="Lee los handoffs, las encuestas y las últimas sesiones del cliente y propone lo que falte en la ficha"
          className="flex-shrink-0"
        >
          {leyendo ? "Leyendo handoff y sesiones… (hasta un minuto)" : "Actualizar con IA"}
        </BotonBlanco>
      </div>

      {/* Los grupos en dos columnas, como el diseño de la ficha (2026-10-04). */}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {GRUPOS_DE_FICHA.map((g) => (
          <section data-recorrido="info.grupo" key={g.clave} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
            <header className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-fg">{g.titulo}</h3>
                {g.clave === "interno" && (
                  <span
                    className="rounded-full border border-line bg-surface-muted px-2 py-px text-[11px] font-medium text-fg-secondary"
                    title="No se le muestra al cliente ni va a la nota de HubSpot"
                  >
                    Solo el equipo
                  </span>
                )}
              </div>
              <p className="text-xs text-fg-muted">{g.bajada}</p>
            </header>
            {CAMPOS_DE_LA_FICHA.filter((c) => c.grupo === g.clave).map((c) =>
              c.deLosResultados ? (
                <CampoDeResultados
                  key={c.clave}
                  campo={c}
                  proyectos={proyectos}
                  textoConfirmado={ficha.valores[c.clave]}
                  cambiado={cambios.includes(c.clave)}
                  canEdit={puedeEditarResultados}
                  canConfirm={puedeConfirmarResultados}
                  onCambio={() => void refrescarResultados()}
                />
              ) : (
              <Campo
                key={c.clave}
                campo={c}
                valor={borrador[c.clave]}
                cambiado={cambios.includes(c.clave)}
                propuesta={propuestas.includes(c.clave) ? ficha.propuesta!.valores[c.clave]! : null}
                fuentes={ficha.propuesta?.fuentesPorCampo[c.clave] ?? []}
                onChange={(v) => set(c.clave, v)}
                onUsar={() => set(c.clave, ficha.propuesta!.valores[c.clave]!)}
                onDescartar={() => void descartarCampo(c.clave)}
              />
              ),
            )}
          </section>
        ))}
      </div>

      {/* La barra de confirmar: fija abajo para que el botón esté siempre a mano en una ficha larga. */}
      <div className="sticky bottom-4">
        <div data-recorrido="info.guardar" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          {(cambios.length > 0 || hubspotPendiente) && !error && (
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-warn-ink" aria-hidden="true" />
          )}
          <p className="min-w-[200px] flex-1 text-[13px] text-fg-secondary">
            {error ? (
              <span className="text-danger-ink">{error}</span>
            ) : aviso ? (
              aviso
            ) : cambios.length ? (
              `${cambios.length} ${cambios.length === 1 ? "campo cambiado" : "campos cambiados"} sin confirmar. Al confirmar, se guarda en la empresa de HubSpot.`
            ) : hubspotPendiente ? (
              "La ficha está confirmada pero no quedó en HubSpot. Confirma de nuevo para reintentar."
            ) : propuestas.length ? (
              "Hay una propuesta de la IA por revisar: usa o descarta cada campo."
            ) : ficha.confirmadaAt ? (
              "Todo confirmado."
            ) : (
              "Completa lo que sepas y confirma: se guarda en Nexus y en la empresa de HubSpot."
            )}
          </p>
          <div className="flex flex-shrink-0 gap-2">
            {cambios.length > 0 && (
              <BotonTexto disabled={guardando} onClick={() => setBorrador((b) => ({ ...ficha.valores, resultadosQuePersigue: b.resultadosQuePersigue }))}>
                Deshacer cambios
              </BotonTexto>
            )}
            <BotonConfirmar
              disabled={guardando || (!cambios.length && !hubspotPendiente && !!ficha.confirmadaAt)}
              onClick={() => void enviar({ valores: borrador })}
            >
              {guardando ? "Guardando…" : hubspotPendiente && !cambios.length ? "Reintentar en HubSpot" : "Confirmar y guardar en HubSpot"}
            </BotonConfirmar>
          </div>
        </div>
      </div>
    </div>
  );
}

/** La línea de estado: quién confirmó y si quedó en HubSpot. En rojo solo si falló. */
function EstadoDeLaFicha({ ficha, hubspotUrl }: { ficha: FichaGuardada; hubspotUrl: string | null }) {
  const h = ficha.hubspot;
  let marca: ReactNode = null;
  let texto = "Todavía sin confirmar. La completa la IA al generar el diagnóstico, o tú a mano.";
  let fallo = false;
  if (ficha.confirmadaAt) {
    const quien = `Confirmada por ${ficha.confirmadaPor ?? "el equipo"} el ${fecha(ficha.confirmadaAt)}`;
    if (h?.estado === "sincronizada") {
      marca = <span className="font-bold text-success-ink">✓</span>;
      texto = `${quien} y guardada en la empresa de HubSpot.`;
    } else if (h?.estado === "sin_empresa") {
      texto = `${quien}. Queda solo en Nexus: el cliente no tiene empresa vinculada en HubSpot.`;
    } else {
      fallo = true;
      texto = `${quien}. ${h?.error ?? "No quedó en HubSpot."}`;
    }
  }
  if (fallo) {
    return (
      <Alert variant="danger" title="No quedó en HubSpot">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{texto}</span>
          {hubspotUrl && (
            <a href={hubspotUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Abrir la empresa en HubSpot ↗
            </a>
          )}
        </span>
      </Alert>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-secondary">
      {marca}
      <span className="min-w-0">{texto}</span>
      {hubspotUrl && (
        <a href={hubspotUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:text-brand-light">
          Abrir la empresa en HubSpot ↗
        </a>
      )}
    </div>
  );
}

function Campo({
  campo,
  valor,
  cambiado,
  propuesta,
  fuentes,
  onChange,
  onUsar,
  onDescartar,
}: {
  campo: CampoDeFicha;
  valor: string;
  cambiado: boolean;
  propuesta: string | null;
  fuentes: string[];
  onChange: (v: string) => void;
  onUsar: () => void;
  onDescartar: () => void;
}) {
  const [verLoDeHoy, setVerLoDeHoy] = useState(false);
  const destino =
    campo.destino.tipo === "nota" ? "Va en la nota de HubSpot" : "Propiedad de la empresa en HubSpot";
  const esLista = campo.destino.tipo === "lista";
  return (
    <div id={`campo-${campo.clave}`} className="flex scroll-mt-24 flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        {/* Con propuesta, el campo no está en pantalla: el rótulo no apunta a un id que no existe. */}
        <label htmlFor={propuesta === null ? `ficha-${campo.clave}` : undefined} className="text-[13px] font-semibold text-fg">
          {campo.etiqueta}
        </label>
        {cambiado && (
          <span className="rounded-full border border-warn-line bg-warn-surface px-[7px] text-[11px] font-semibold text-warn-ink">
            cambiado sin confirmar
          </span>
        )}
        <span className="ml-auto flex-shrink-0 text-[11px] text-fg-muted">{destino}</span>
      </div>
      <p className="text-xs text-fg-muted">{campo.ayuda}</p>
      {propuesta !== null ? (
        /* ── LO QUE PROPONE LA IA, EN LA MISMA CAJA (pedido de Elías, 2026-10-04) ──────────────
           Ocupa el lugar del campo y se lee como va a quedar si se usa: viñetas como viñetas y
           negritas como negritas. «Usar» lo deja como el valor del campo, editable; «Descartar»
           devuelve el campo con lo que tenía. Lo de hoy se puede mirar sin perder la propuesta. */
        <div data-recorrido="info.propuesta" className="flex items-start gap-2.5 rounded-lg border border-info-line bg-info-surface px-3 py-2.5">
          <IconoDeSugerencia className="mt-0.5 h-[15px] w-[15px] flex-shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            {esLista ? (
              <p className="text-sm text-fg">{etiquetaDeApertura(propuesta)}</p>
            ) : (
              <TextoConFormato texto={propuesta} className="text-sm text-fg" />
            )}
            <p className="mt-1 text-xs text-fg-muted">
              {fuentes.length > 0 ? `Lo propone la IA con: ${fuentes.join(" · ")}` : "Lo propone la IA"}
              {" · Úsala y ajústala en el campo si hace falta"}
              {valor.trim() && (
                <>
                  {" · "}
                  <button type="button" onClick={() => setVerLoDeHoy((v) => !v)} className="text-brand hover:text-brand-light">
                    {verLoDeHoy ? "Ocultar lo que dice hoy" : "Ver lo que dice hoy"}
                  </button>
                </>
              )}
            </p>
            {verLoDeHoy && valor.trim() && (
              <div className="mt-2 rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-fg-secondary">
                {esLista ? etiquetaDeApertura(valor) : <TextoConFormato texto={valor} />}
              </div>
            )}
          </div>
          <BotonTexto className="flex-shrink-0" onClick={onDescartar}>
            Descartar
          </BotonTexto>
          <BotonAzul className="flex-shrink-0" onClick={onUsar}>
            Usar
          </BotonAzul>
        </div>
      ) : esLista ? (
        <select
          id={`ficha-${campo.clave}`}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:border-brand"
        >
          <option value="">Elige una opción</option>
          {OPCIONES_DE_APERTURA.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      ) : (
        <AreaDeTexto id={`ficha-${campo.clave}`} valor={valor} onChange={onChange} />
      )}
    </div>
  );
}

/**
 * «Resultados que persigue»: las listas de resultados medibles de los proyectos del cliente, que se
 * editan y se confirman acá (el Resumen de cada proyecto solo las lee). Con más de un proyecto, cada
 * lista lleva su nombre.
 */
function CampoDeResultados({
  campo,
  proyectos,
  textoConfirmado,
  cambiado,
  canEdit,
  canConfirm,
  onCambio,
}: {
  campo: CampoDeFicha;
  proyectos: ProyectoConResultados[];
  /** Lo que la ficha tiene confirmado hoy (de antes de las listas, o de la última confirmación). */
  textoConfirmado: string;
  cambiado: boolean;
  canEdit: boolean;
  canConfirm: boolean;
  onCambio: () => void;
}) {
  return (
    <div id={`campo-${campo.clave}`} data-recorrido="info.resultados" className="flex scroll-mt-24 flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-semibold text-fg">{campo.etiqueta}</span>
        {cambiado && (
          <span
            className="rounded-full border border-warn-line bg-warn-surface px-[7px] text-[11px] font-semibold text-warn-ink"
            title="Lo confirmado cambió: confirma la ficha para llevarlo a HubSpot"
          >
            cambiado sin confirmar
          </span>
        )}
        <span className="ml-auto flex-shrink-0 text-[11px] text-fg-muted">Propiedad de la empresa en HubSpot</span>
      </div>
      <p className="text-xs text-fg-muted">{campo.ayuda}</p>
      {proyectos.length === 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] text-fg-muted">Todavía no hay un handoff en los proyectos del cliente: los resultados salen de ahí.</p>
          {textoConfirmado.trim() && (
            <div className="rounded-md border border-line bg-surface-muted px-2.5 py-2 text-[13px] text-fg-secondary">
              <span className={ROTULO_DEL_SISTEMA}>Lo que dice la ficha hoy</span>
              <TextoConFormato texto={textoConfirmado} />
            </div>
          )}
        </div>
      ) : (
        proyectos.map((p) => (
          <div key={p.projectId} className="flex flex-col gap-2">
            {proyectos.length > 1 && <span className={ROTULO_DEL_SISTEMA}>{p.proyecto}</span>}
            <ResultadosMediblesDelHandoff projectId={p.projectId} canEdit={canEdit} canConfirm={canConfirm} onCambio={onCambio} />
          </div>
        ))
      )}
    </div>
  );
}

/** Crece con el contenido: una ficha con 10 campos no puede tener 10 barras de scroll. */
function AreaDeTexto({ id, valor, onChange }: { id: string; valor: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ajustar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // + el borde: scrollHeight no lo cuenta y, sin él, cada campo muestra una barra de 2 px.
    const borde = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.max(el.scrollHeight + borde, 64)}px`;
  }, []);
  useEffect(ajustar, [valor, ajustar]);
  // El alto depende del ANCHO: medido en una ventana angosta, al ensancharla quedaba un campo de una
  // línea con 1.400 px de alto. Se re-mide cuando cambia el ancho del propio campo.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let ancho = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== ancho) {
        ancho = el.clientWidth;
        ajustar();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ajustar]);
  return (
    <textarea
      id={id}
      ref={ref}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg leading-relaxed focus:outline-none focus:border-brand"
    />
  );
}
