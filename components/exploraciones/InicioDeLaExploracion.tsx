"use client";

/**
 * InicioDeLaExploracion — la página de inicio de Exploración (etapa A, 2026-10-09, diseño v13: tableros
 * Main.dc.html para un cliente y Prospecto.dc.html para un prospecto).
 *
 * La exploración son sus SESIONES: no hay una lista general de reuniones (las demás las tiene la
 * memoria). De arriba hacia abajo:
 *   · «Sesiones de la exploración»: cada una con su número, su reunión, su estado y lo que se puede
 *     hacer («Leerla», unirla a una reunión, «Abrir»), y «+ Agregar sesión» (agendada, una que ya pasó o
 *     sin reunión). La próxima lleva «Preparar la sesión» (el único botón azul) y, debajo, si la guía es
 *     la de base, está al día o está vieja (Elías, 30 oct: la tarjeta «Próxima sesión» repetía esta fila).
 *     En un prospecto cada reunión con la empresa entra sola: se sacan de a una o varias
 *     (con casillas) a «Fuera de la exploración». En un cliente o un proyecto nada entra solo y se
 *     quitan con su X. Sacar se deshace (Ctrl+Z) y no borra ninguna reunión;
 *   · las fuentes manuales (lo que no quedó en Meet) y las instrucciones adicionales de la exploración
 *     (las leen la lectura de cada sesión y la guía; no son evidencia);
 *   · «Lo que la IA ya sabe, sin que elijas nada»: los conteos de la memoria (etapa 3), en tarjetas.
 */
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonEnlace, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import ListaDeReuniones, { type ReunionDeLaLista } from "@/components/contexto/ListaDeReuniones";
import type { EscribirReuniones } from "@/components/contexto/useEleccionDeReuniones";
import { cn } from "@/lib/cn";
import { datosConOrigen } from "@/lib/contexto/lista-de-reuniones";
import type { Operacion } from "@/lib/exploraciones/contenido";
import { diaConSemana } from "@/lib/exploraciones/fechas";
import {
  claveDeReunion,
  nombreDeLaPestana,
  nuevoIdDeSesion,
  tituloDeLaSesion,
  type EstadoDeLaReunion,
  type PestanaDeSesion,
} from "@/lib/exploraciones/guia";
import {
  datosDeLaSesion,
  devolverALaExploracion,
  estadoCortoDeLaGuia,
  estadoDeLaFila,
  horario,
  pideUnirla,
  pistaDeLaProxima,
  sacarDeLaExploracion,
  sesionDesdeLaReunion,
  type LoSacado,
  type TonoDeLaFila,
} from "@/lib/exploraciones/inicio";
import { claveDeInstrucciones, MAX_NOTA_DE_SESION } from "@/lib/exploraciones/notas-de-sesion";
import { tarjetasDeLoQueSabeLaIA } from "@/lib/exploraciones/lo-que-sabe-la-ia";
import AgregarSesion from "./AgregarSesion";
import SumarAMano from "./SumarAMano";
import { useLienzo } from "./contexto";
import { useCambiosDesdeLaGuia } from "./piezas-de-la-sesion";
import { useCorrida } from "./useCorrida";
import { useSesiones } from "./useSesiones";
import LoQueSabes from "./LoQueSabes";
import { DondeQuedo } from "./LoQueDejoLaSesion";

const ORIGEN = { meet: "Google Meet", hubspot: "HubSpot", documento: "Sumada a mano" } as const;

const PUNTO: Record<TonoDeLaFila, string> = { bien: "bg-success", atencion: "bg-warning", neutro: "bg-fg-muted" };
const TEXTO: Record<TonoDeLaFila, string> = { bien: "font-medium text-success-ink", atencion: "font-medium text-warn-ink", neutro: "text-fg-muted" };

function Contador({ n }: { n: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-line px-1.5 text-[11px] text-fg-muted" aria-label={`${n}`}>
      {n}
    </span>
  );
}

// ── «Preparar la sesión» ──────────────────────────────────────────────────────

/** El botón de la próxima sesión y, debajo, cómo está su guía (la de base, al día o vieja). */
function PrepararLaSesion({ p }: { p: PestanaDeSesion }) {
  const { sesion } = useLienzo();
  const { corrida, corriendo } = useCorrida();
  // El mismo «qué cambió» que la Preparación (piezas-de-la-sesion.tsx › `useCambiosDesdeLaGuia`).
  const { guia, cambios } = useCambiosDesdeLaGuia(p);
  const armando = corriendo && corrida?.modo === "guia";
  const preparar = () => {
    sesion.elegir(p.clave);
    sesion.ponerMomento(p.clave, "antes");
  };
  return (
    <span className="flex flex-none flex-col items-end gap-0.5">
      <BotonAzul className="rounded-lg px-3 py-1.5 text-[13px]" onClick={preparar}>
        Preparar la sesión
      </BotonAzul>
      <span className="text-[11px] text-fg-muted">{armando ? "el agente está armando la guía" : estadoCortoDeLaGuia(!!guia, cambios)}</span>
    </span>
  );
}

const INSIGNIA_DE_LA_PROXIMA = (
  <span className="inline-flex flex-none rounded-full border border-info-line bg-info-surface px-2 py-px text-[11px] font-semibold text-brand">Próxima</span>
);

/**
 * La próxima sesión cuando todavía no es una fila de la lista: no hay ninguna por delante (se prepara igual), o está
 * agendada en HubSpot y nadie la agregó como sesión.
 */
function ProximaFueraDeLaLista({ p }: { p: PestanaDeSesion }) {
  const { puedeEditar, sesion } = useLienzo();
  const { proxima, estadoDeLaReunion } = useSesiones();
  const deHubspot = proxima.desde === "hubspot";
  const titulo = (deHubspot ? proxima.titulo : null) ?? nombreDeLaPestana(p);
  const cuando = deHubspot && proxima.fecha ? [diaConSemana(proxima.fecha), horario(proxima.fecha)].filter(Boolean).join(" · ") : "Sin agendar";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
      <NumeroDeLaSesion p={p} estado={estadoDeLaReunion(p)} esLaProxima />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <span className="truncate">{titulo}</span>
          {INSIGNIA_DE_LA_PROXIMA}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          <span>{cuando}</span>
          <span>·</span>
          {deHubspot ? (
            <>
              <span>Agendada en HubSpot</span>
              {puedeEditar && (
                <>
                  <span>·</span>
                  <BotonEnlace className="text-xs" onClick={() => sesion.buscarReunion({ tipo: "nueva", ver: "agendadas", elegir: true })}>
                    agregarla como sesión
                  </BotonEnlace>
                </>
              )}
            </>
          ) : (
            <>
              <span>la guía se puede preparar igual</span>
              {puedeEditar && (
                <>
                  <span>·</span>
                  <BotonEnlace className="text-xs" onClick={() => sesion.buscarReunion({ tipo: "nueva", elegir: true })}>
                    unirla a una del calendario
                  </BotonEnlace>
                </>
              )}
            </>
          )}
        </p>
      </div>
      <PrepararLaSesion p={p} />
    </div>
  );
}

// ── Las sesiones ──────────────────────────────────────────────────────────────

/** El número de la sesión, en un círculo con el color de su estado (punteado si no tiene reunión). */
function NumeroDeLaSesion({ p, estado, esLaProxima }: { p: PestanaDeSesion; estado: EstadoDeLaReunion; esLaProxima: boolean }) {
  const tono =
    estado === "noSeHizo"
      ? "bg-surface-muted text-fg-muted"
      : estado === "leida"
        ? "bg-success-surface text-success-ink"
        : esLaProxima || estado === "agendada" || estado === "esperando"
          ? "bg-info-surface text-brand"
          : estado === "sinReunion"
            ? "border border-dashed border-line text-fg-muted"
            : "bg-warn-surface text-warn-ink";
  return (
    <span aria-hidden className={cn("inline-flex h-[26px] w-[26px] flex-none items-center justify-center self-center rounded-full text-xs font-semibold", tono)}>
      {p.noSeHizo ? "–" : p.numero}
    </span>
  );
}

function LasSesiones() {
  const { exp, puedeEditar, cambiar, sesion } = useLienzo();
  const { pestanas, todas, claveDeLaProxima, estadoDeLaReunion, fuera } = useSesiones();
  const { corriendo, lanzando, lanzar } = useCorrida();
  const automaticas = exp.automaticas;
  // Lo sacado, para deshacerlo (la sesión ya no está en el estado cuando llega el Ctrl+Z).
  const sacadas = useRef(new Map<string, LoSacado>());

  const porClave = new Map(pestanas.map((p) => [p.clave, p]));
  const claveDeFuera = (r: { origen: string; id: string }) => `fuera:${claveDeReunion(r)}`;

  const proximaFuera = porClave.has(claveDeLaProxima) ? null : (todas.find((p) => p.clave === claveDeLaProxima) ?? null);
  const proximaEnLaLista = porClave.get(claveDeLaProxima);
  const pista = proximaEnLaLista ? pistaDeLaProxima(estadoDeLaReunion(proximaEnLaLista)) : null;

  const filas: ReunionDeLaLista[] = pestanas.map((p) => {
    const estado = estadoDeLaReunion(p);
    const esLaProxima = p.clave === claveDeLaProxima;
    return {
      id: p.clave,
      titulo: tituloDeLaSesion(p) ?? nombreDeLaPestana(p),
      datos: datosDeLaSesion(p, estado),
      insignia: esLaProxima ? INSIGNIA_DE_LA_PROXIMA : undefined,
    };
  });
  const excluidas: ReunionDeLaLista[] = fuera.map((r) => ({ id: claveDeFuera(r), titulo: r.titulo, datos: datosConOrigen(ORIGEN[r.origen], r.fecha) }));

  /* Sacar (incluir false) quita la sesión y, en un prospecto, deja su reunión fuera. Incluir devuelve lo
     sacado (el deshacer) o, desde «Fuera de la exploración», vuelve a agregar la reunión como sesión. */
  const escribir: EscribirReuniones = async (ids, incluir) => {
    if (!incluir) {
      const { ops, sacadas: lo } = sacarDeLaExploracion(pestanas, ids, automaticas);
      if (!ops.length) return false;
      const ok = await cambiar(ops);
      if (ok) for (const s of lo) sacadas.current.set(s.clave, s);
      return ok;
    }
    const ops: Operacion[] = [];
    for (const id of ids) {
      const r = id.startsWith("fuera:") ? fuera.find((x) => claveDeFuera(x) === id) : null;
      if (r) ops.push({ op: "agregarSesion", sesion: sesionDesdeLaReunion(r, nuevoIdDeSesion()) });
    }
    const devueltas = ids.flatMap((id) => {
      const s = sacadas.current.get(id);
      return s ? [s] : [];
    });
    ops.push(...devolverALaExploracion(devueltas));
    if (!ops.length) return false;
    const ok = await cambiar(ops);
    if (ok) for (const s of devueltas) sacadas.current.delete(s.clave);
    return ok;
  };

  const abrir = (p: PestanaDeSesion) => {
    sesion.elegir(p.clave);
    const e = estadoDeLaReunion(p);
    sesion.ponerMomento(p.clave, p.hecha || e === "esperando" || e === "sinTexto" ? "despues" : "antes");
  };

  return (
    <section data-recorrido="preventa.inicio" aria-labelledby="exploracion-sesiones" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h3 id="exploracion-sesiones" className="text-sm font-semibold text-fg">
          Sesiones de la exploración
        </h3>
        <Contador n={pestanas.length} />
        <span className="flex-1" />
        <AgregarSesion variante="boton" />
      </div>
      {automaticas && (
        <p className="text-xs leading-[18px] text-fg-muted">
          Mientras {exp.empresa.nombre} sea prospecto, cada reunión con la empresa <strong className="font-semibold text-fg-secondary">entra sola como sesión</strong>.
          Saca las que no son de exploración, una o varias.
        </p>
      )}
      <ListaDeReuniones
        reuniones={filas}
        excluidas={excluidas}
        puedeEditar={puedeEditar}
        escribir={escribir}
        restaurar={(ids) => escribir(ids, true)}
        vacio={
          automaticas
            ? "Todavía no hay reuniones con la empresa. Cuando haya una, entra sola como sesión; también puedes agregarla."
            : "Todavía no hay sesiones. Agrega la primera: una agendada, una que ya pasó o una sin reunión todavía."
        }
        etiquetaQuitar={(titulo) => `Sacar «${titulo}» de la exploración`}
        tituloQuitar="Sacar de la exploración · la reunión no se borra"
        // Casillas en todas en un prospecto (se sacan de a varias); en un cliente o un proyecto, solo la X.
        minimoParaElegir={automaticas ? 1 : Number.POSITIVE_INFINITY}
        antes={(fila) => {
          const p = porClave.get(fila.id);
          return p ? <NumeroDeLaSesion p={p} estado={estadoDeLaReunion(p)} esLaProxima={p.clave === claveDeLaProxima} /> : null;
        }}
        acciones={(fila) => {
          const p = porClave.get(fila.id);
          if (!p) return null;
          const estado = estadoDeLaReunion(p);
          const ef = estadoDeLaFila(estado);
          const r = p.reunion;
          const s = p.sesion;
          return (
            <>
              {ef && (
                <span className={cn("hidden items-center gap-1.5 whitespace-nowrap text-xs sm:inline-flex", TEXTO[ef.tono])}>
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", PUNTO[ef.tono])} />
                  {ef.texto}
                </span>
              )}
              {puedeEditar && ef?.leer && r && (
                <BotonBlanco disabled={corriendo || lanzando} onClick={() => void lanzar("leer", r.origen === "meet" ? { sesionId: r.id } : {})}>
                  Leerla
                </BotonBlanco>
              )}
              {puedeEditar && s && pideUnirla(estado) && (
                <BotonEnlace onClick={() => sesion.buscarReunion({ tipo: "unir", sesionId: s.id })}>
                  {estado === "cancelada" ? "Asociar otra reunión" : "Unirla a una del calendario"}
                </BotonEnlace>
              )}
              {/* En la próxima, «Abrir» sería el mismo «Preparar»: solo queda si la reunión ya empezó. */}
              {(p.clave !== claveDeLaProxima || p.hecha || estado === "esperando" || estado === "sinTexto") && (
                <BotonEnlace className="text-[13px]" onClick={() => abrir(p)}>
                  Abrir
                </BotonEnlace>
              )}
              {p.clave === claveDeLaProxima && <PrepararLaSesion p={p} />}
            </>
          );
        }}
        textoQuitar={(n) => (n === 1 ? "Sacar la sesión de la exploración" : `Sacar las ${n} de la exploración`)}
        textoDeshacer={(n) => (n === 1 ? "Sacaste 1 sesión de la exploración." : `Sacaste ${n} sesiones de la exploración.`)}
        rotuloExcluidas={(n) => `Fuera de la exploración (${n})`}
        explicacionExcluidas={
          automaticas
            ? "Las reuniones que sacaste de las sesiones. No se borran: vuelven con «Agregar como sesión»."
            : "Lo que se leyó o se eligió antes y no es una sesión. No se borra: vuelve con «Agregar como sesión»."
        }
        accionExcluida="Agregar como sesión"
        sinTope
      />
      {proximaFuera && <ProximaFueraDeLaLista p={proximaFuera} />}
      {pista && <p className="text-xs leading-[18px] text-fg-secondary">La próxima sesión: {pista}.</p>}
      <p className="text-xs leading-[18px] text-fg-muted">
        {automaticas
          ? "Lo que sacas no se borra: pasa a «Fuera de la exploración» y se puede devolver. Se deshace con Ctrl+Z."
          : "Solo las sesiones de esta lista entran a la exploración: el agente lee cada una contra su guía. Sacar una no borra la reunión."}
      </p>
    </section>
  );
}

// ── Las fuentes manuales y las instrucciones ──────────────────────────────────

function IconoDeDocumento() {
  return (
    <svg className="h-4 w-4 flex-none text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

function FuentesManuales() {
  const { documentos } = useLienzo();
  // La preventa que se abre «Con una transcripción» llega con `?sumar=1`: el formulario, abierto.
  const sumarAlAbrir = useSearchParams().get("sumar") === "1";
  return (
    <section aria-labelledby="exploracion-fuentes" className="flex min-w-0 flex-[1_1_340px] flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center gap-2">
        <IconoDeDocumento />
        <h3 id="exploracion-fuentes" className="text-sm font-semibold text-fg">
          Fuentes manuales
        </h3>
        <span className="flex-1" />
        <Contador n={documentos.length} />
      </div>
      {documentos.length === 0 && (
        <p className="text-[13px] leading-[19px] text-fg-muted">Lo que no quedó en Meet: una llamada de Gong, una minuta o un documento del cliente. El agente lo lee como una sesión más.</p>
      )}
      <SumarAMano abiertoAlInicio={sumarAlAbrir} sinVacio />
    </section>
  );
}

function Instrucciones() {
  const { exp, puedeEditar, cambiar } = useLienzo();
  const clave = claveDeInstrucciones("exploracion");
  const guardadas = exp.estado.contenido.notas[clave] ?? "";
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(guardadas);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const ok = await cambiar([{ op: "nota", paso: clave, texto: texto.trim() }]);
      if (ok) setEditando(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section aria-labelledby="exploracion-instrucciones" className="flex min-w-0 flex-[1_1_340px] flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 flex-none text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 6h16M4 12h10M4 18h7" />
        </svg>
        <h3 id="exploracion-instrucciones" className="text-sm font-semibold text-fg">
          Instrucciones adicionales
        </h3>
      </div>
      {editando ? (
        <>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            maxLength={MAX_NOTA_DE_SESION}
            autoFocus
            aria-label="Instrucciones adicionales de la exploración"
            placeholder='Ej.: "Pregunta sobre todo por Servicio: es donde el cliente siente que pierde clientes."'
          />
          <div className="flex items-center justify-between gap-2">
            <p className={cn("text-2xs", texto.length >= MAX_NOTA_DE_SESION ? "text-warn-ink" : "text-fg-muted")} aria-live="polite">
              {texto.length.toLocaleString("es-CR")} / {MAX_NOTA_DE_SESION.toLocaleString("es-CR")}
            </p>
            <div className="flex items-center gap-1">
              <BotonTexto
                onClick={() => {
                  setTexto(guardadas);
                  setEditando(false);
                }}
              >
                Cancelar
              </BotonTexto>
              <BotonBlanco disabled={guardando || texto.trim() === guardadas.trim()} onClick={() => void guardar()}>
                {guardando ? "Guardando…" : "Guardar"}
              </BotonBlanco>
            </div>
          </div>
        </>
      ) : guardadas.trim() ? (
        <p className="whitespace-pre-wrap text-[13px] leading-[19px] text-fg-secondary">«{guardadas.trim()}»</p>
      ) : (
        <p className="text-[13px] leading-[19px] text-fg-muted">
          Lo que la IA tiene que tener en cuenta al preparar y leer las sesiones. Pesa más que lo demás y no cuenta como algo que dijo el cliente.
        </p>
      )}
      {puedeEditar && !editando && (
        <BotonEnlace
          className="self-start text-[13px]"
          onClick={() => {
            setTexto(guardadas);
            setEditando(true);
          }}
        >
          {guardadas.trim() ? "Editar" : "Escribirlas"}
        </BotonEnlace>
      )}
    </section>
  );
}

/**
 * «Lo que la IA ya sabe, sin que elijas nada» (diseño v13): lo que la memoria ya le da a la IA sin que nadie elija una
 * reunión. Son conteos (lib/exploraciones/lo-que-sabe-la-ia.ts), nunca el contenido. Si no llegó (falló la lectura),
 * no se muestra.
 */
function LoQueSabeLaIA() {
  const { exp } = useLienzo();
  const sabe = exp.loQueSabeLaIA;
  if (!sabe) return null;
  const tarjetas = tarjetasDeLoQueSabeLaIA(sabe, { enUnProyecto: !!exp.projectId });
  return (
    <section aria-labelledby="exploracion-sabe" className="flex flex-col gap-2.5">
      <h3 id="exploracion-sabe" className="text-sm font-semibold text-fg">
        Lo que la IA ya sabe, sin que elijas nada
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tarjetas.map((t) => (
          <div key={t.clave} className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3.5">
            <p className={ROTULO_DEL_SISTEMA}>{t.titulo}</p>
            <p className="text-[15px] font-semibold text-fg">{t.valor}</p>
            {t.detalle && <p className="text-[13px] leading-[19px] text-fg-muted">{t.detalle}</p>}
          </div>
        ))}
      </div>
      {sabe.memoriaUrl && (
        <a href={sabe.memoriaUrl} className="self-start text-[13px] font-medium text-brand hover:underline">
          Ver la memoria del proyecto
        </a>
      )}
    </section>
  );
}

// ── La página ─────────────────────────────────────────────────────────────────

export default function InicioDeLaExploracion() {
  const { exp, marco } = useLienzo();
  const subtitulo =
    marco.clave === "cs"
      ? `Las sesiones para entender la estrategia de ${exp.empresa.nombre} y dónde está en la escala.`
      : exp.automaticas
        ? "Cada reunión con la empresa: la preparas, la vives y el agente la analiza."
        : "Cada sesión con la empresa: la preparas, la vives y el agente la analiza.";
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-[22px] font-bold leading-7 text-fg">Exploración</h2>
        <p className="text-[15px] text-fg-muted">{subtitulo}</p>
      </header>
      {/* Punto 16 (2026-11-06): cualquiera del equipo ve en qué sesión quedó, qué se averiguó y qué falta. */}
      <DondeQuedo />
      <LasSesiones />
      <div data-recorrido="preventa.inicio.fuentes" className="flex flex-wrap gap-4">
        <FuentesManuales />
        <Instrucciones />
      </div>
      {/* K6 (2026-10-27): lo que alguien del equipo sabe y no quedó en ninguna reunión; entra entero a la guía. */}
      <LoQueSabes />
      <LoQueSabeLaIA />
    </div>
  );
}
