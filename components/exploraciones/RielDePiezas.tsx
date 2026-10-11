"use client";

/**
 * RielDePiezas — la barra de la izquierda del lienzo: las piezas en orden y, debajo de Exploración,
 * cada sesión (rediseño de escritorio, pedido de Elías del 2026-10-03: «la interfaz no está pensada
 * para desktop»). Reemplaza al desplegable de piezas y a las pestañas de sesión: a la vista todo el
 * tiempo, sin abrir nada. Abajo, «Cómo manejar objeciones», a mano en cualquier pieza.
 *
 * Copia el tablero «1 · Sesión — Antes» medida por medida: filas de 14 px con un punto de 8 px; la
 * pieza abierta en azul sobre fondo azul claro (Exploración, cuando hay una sesión elegida, va en
 * negrita oscura y la sesión es la que se pinta); las sesiones colgadas con una línea a la izquierda.
 * Desde la etapa A (2026-10-09) la marca de cada sesión dice en qué está su reunión
 * (`estadoDeLaReunionDeLaSesion`): ✓ la leída, ● ámbar la que no se leyó o le falta texto, ○ la que no
 * tiene reunión o todavía no ocurre; «+ Agregar sesión» abre el menú de tres opciones, y tocar
 * «Exploración» vuelve a su página de inicio.
 *
 * El punto de cada pieza: azul si el agente sugirió algo ahí (con cuántas, en azul), ámbar si pide
 * atención (hipótesis, reuniones sin leer, lista para proponer), verde si ya tiene contenido, gris si
 * todavía nada. En pantallas chicas se acuesta y las sesiones se eligen en Exploración.
 */
import type { EstadoDePieza, FilaDePieza } from "@/components/canvas/SelectorDePiezas";
import AvisoDeFicha from "@/components/clients/AvisoDeFicha";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { nombreDeLaPestana, tituloDeLaSesion, type EstadoDeLaReunion, type PestanaDeSesion } from "@/lib/exploraciones/guia";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { useLienzo, type PasoDelLienzoUI } from "./contexto";
import AgregarSesion from "./AgregarSesion";
import { BotonDeObjeciones } from "./ManejoDeObjeciones";
import { useSesiones } from "./useSesiones";
import { IconoDeSugerencia } from "./FranjaDeSugerencias";

/** Una fila de la barra: la del selector de piezas, más cuántas sugerencias esperan ahí. */
export type FilaDelRiel = FilaDePieza & { sugeridas: number };

const PUNTO: Record<EstadoDePieza, string> = {
  generada: "bg-success",
  pendiente: "bg-warning",
  vacia: "bg-fg-muted/30",
};

function Fila({
  etiqueta,
  activa,
  conSesion,
  estado,
  aviso,
  sugeridas,
  title,
  onClick,
}: {
  etiqueta: string;
  activa: boolean;
  /** Es Exploración con una sesión elegida debajo: la sesión es la que se pinta. */
  conSesion?: boolean;
  estado: EstadoDePieza;
  aviso?: string | null;
  /** Cuántas sugerencias esperan; el texto que las nombra, si no es solo el número. */
  sugeridas: { n: number; texto?: string };
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-current={activa ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
        activa && !conSesion
          ? "bg-info-surface font-semibold text-brand"
          : activa
            ? "font-semibold text-fg hover:bg-surface-hover"
            : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
      )}
    >
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", activa || sugeridas.n > 0 ? "bg-brand" : PUNTO[estado])} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
      {sugeridas.n > 0 ? (
        <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-brand" title={`${sugeridas.n} sugerencias del agente`}>
          <IconoDeSugerencia className="h-[13px] w-[13px]" />
          {sugeridas.texto ?? sugeridas.n}
        </span>
      ) : (
        aviso && <span className={cn("flex-shrink-0 text-xs", estado === "pendiente" ? "text-warn-ink" : "text-fg-muted")}>{aviso}</span>
      )}
    </button>
  );
}

/** Una fila de «La cuenta», igual que en la ficha del cliente (components/clients/RielDelCliente.tsx). */
function FilaDeCuenta({ etiqueta, activa, onClick, extra }: { etiqueta: string; activa: boolean; onClick: () => void; extra?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors lg:w-full",
        activa ? "bg-info-surface font-semibold text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
      )}
    >
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", activa ? "bg-brand" : "bg-fg-muted/30")} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
      {extra}
    </button>
  );
}

/** Una fila más debajo de las sesiones (en un proyecto: «Informe anterior»). */
export interface FilaExtraDelRiel {
  clave: string;
  etiqueta: string;
  activa: boolean;
  onClick: () => void;
}

/** Lo que dice la marca ámbar de una sesión, al pasar el mouse. */
const AVISO_DE_LA_MARCA: Partial<Record<EstadoDeLaReunion, string>> = {
  sinLeer: "Reunión sin leer",
  soloNotasSinLeer: "Solo notas de Gemini, sin leer",
  esperando: "Esperando la transcripción",
  sinTexto: "Terminó sin transcripción ni notas: suma la minuta o di qué pasó",
  cancelada: "La reunión se canceló en el calendario",
  corta: "Sin transcripción: dile qué pasó con ella",
};

/**
 * Las sesiones, colgadas de Exploración. Las usa también la ficha del cliente (la exploración de un
 * proyecto, 2026-10-07): las pinta por portal debajo de su fila «Exploración», con sus `extras`.
 */
export function Sesiones({ abierta, alElegir, extras = [] }: { abierta: boolean; alElegir: (clave: string) => void; extras?: readonly FilaExtraDelRiel[] }) {
  const { sesion, puedeEditar } = useLienzo();
  const { pestanas, activa, estadoDe, estadoDeLaReunion } = useSesiones();
  const marca = (p: PestanaDeSesion, actual: boolean, estado: EstadoDeLaReunion) => {
    if (actual) return <span aria-hidden="true">●</span>;
    if (estado === "noSeHizo")
      return (
        <span className="text-fg-muted" aria-label="no se hizo">
          –
        </span>
      );
    // Con «¿Qué pasó?» ya respondido (otro canal, se cortó), la sesión quedó resuelta.
    if (estado === "leida" || (p.sesion?.resultado && estado !== "agendada"))
      return (
        <span className="text-success" aria-label="leída">
          ✓
        </span>
      );
    const aviso = AVISO_DE_LA_MARCA[estado];
    if (aviso)
      return (
        <span className="text-warning" title={aviso}>
          ●
        </span>
      );
    return (
      <span className="text-fg-muted" aria-hidden="true">
        ○
      </span>
    );
  };
  return (
    <ul data-recorrido="preventa.sesiones" className="mb-1.5 ml-[18px] mt-0.5 space-y-0.5 border-l border-line pl-2">
      {pestanas.map((p) => {
        const actual = abierta && !sesion.enInicio && p.clave === activa.clave;
        const estado = estadoDeLaReunion(p);
        const titulo = tituloDeLaSesion(p);
        return (
          <li key={p.clave}>
            <button
              type="button"
              aria-current={actual ? "true" : undefined}
              title={titulo ? `${nombreDeLaPestana(p)} · ${titulo}` : undefined}
              onClick={() => alElegir(p.clave)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
                actual ? "bg-info-surface font-semibold text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
              )}
            >
              {marca(p, actual, estado)}
              {/* El título de la sesión (el del calendario o el que le pusiste), con su número delante. */}
              <span className={cn("min-w-0 flex-1 truncate", p.noSeHizo && !actual && "text-fg-muted line-through")}>
                {titulo ? (
                  <>
                    {!p.noSeHizo && <span className={cn("tabular-nums", !actual && "text-fg-muted")}>{p.numero}. </span>}
                    {titulo}
                  </>
                ) : (
                  nombreDeLaPestana(p)
                )}
              </span>
              {estadoDe(p) === "proxima" ? (
                <span className="flex-shrink-0 text-[11.5px] font-semibold text-brand">próxima{p.fecha ? ` · ${diaCorto(p.fecha)}` : ""}</span>
              ) : p.fecha ? (
                <span className={cn("flex-shrink-0 text-[11.5px]", actual ? "" : "text-fg-muted")}>{diaCorto(p.fecha)}</span>
              ) : (
                estado === "sinReunion" && <span className={cn("flex-shrink-0 text-[11.5px]", actual ? "" : "text-fg-muted")}>sin reunión</span>
              )}
            </button>
          </li>
        );
      })}
      {puedeEditar && (
        <li>
          <AgregarSesion variante="riel" />
        </li>
      )}
      {extras.map((x) => (
        <li key={x.clave}>
          <button
            type="button"
            aria-current={x.activa ? "true" : undefined}
            onClick={x.onClick}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
              x.activa ? "bg-info-surface font-semibold text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
            )}
          >
            <span className="h-2 w-2 flex-shrink-0 rounded-full border border-line" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{x.etiqueta}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function RielDePiezas({
  paso,
  onElegir,
  resumen,
  filas,
  clientId,
}: {
  paso: PasoDelLienzoUI;
  onElegir: (p: PasoDelLienzoUI) => void;
  resumen: { sugeridas: number; confirmadas: number; estado: EstadoDePieza };
  filas: readonly FilaDelRiel[];
  /** La empresa: «La cuenta» muestra su ficha y sus procesos, los mismos de la ficha del cliente. */
  clientId: string;
}) {
  const { sesion, abrirObjeciones } = useLienzo();
  return (
    <nav data-recorrido="preventa.riel" aria-label="Piezas de la preventa" className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap gap-0.5 lg:flex-col">
        <div className="lg:w-full">
          <Fila
            etiqueta="Resumen"
            activa={paso === "resumen"}
            estado={resumen.estado}
            aviso={`${resumen.confirmadas}/8`}
            sugeridas={{ n: resumen.sugeridas, texto: `${resumen.sugeridas} ${resumen.sugeridas === 1 ? "sugerida" : "sugeridas"}` }}
            onClick={() => onElegir("resumen")}
          />
        </div>
        {filas.map((f) => (
          <div key={f.clave} className="lg:w-full">
            <Fila
              etiqueta={f.etiqueta}
              activa={paso === f.clave}
              conSesion={f.clave === "exploracion" && !sesion.enInicio}
              estado={f.estado}
              aviso={f.aviso?.corto ?? null}
              sugeridas={{ n: f.sugeridas }}
              title={f.aviso?.largo ?? f.ayuda}
              onClick={() => {
                onElegir(f.clave as PasoDelLienzoUI);
                // Tocar «Exploración» (también estando adentro de una sesión) vuelve a su página de inicio.
                if (f.clave === "exploracion") sesion.irAlInicio();
              }}
            />
            {f.clave === "exploracion" && (
              <div className="hidden lg:block">
                <Sesiones
                  abierta={paso === "exploracion"}
                  alElegir={(clave) => {
                    // Primero la pieza (que, viniendo de otra, arranca en el inicio) y después la sesión.
                    onElegir("exploracion");
                    sesion.elegir(clave);
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Aparte, como en la ficha del cliente: lo de la empresa, compartido con su ficha (2026-10-06). */}
      <div data-recorrido="preventa.cuenta" className="flex flex-wrap gap-0.5 border-t border-line pt-2.5 lg:flex-col">
        <p className={cn(ROTULO_DEL_SISTEMA, "w-full px-2.5 pb-1.5")}>La cuenta</p>
        <FilaDeCuenta etiqueta="Información del cliente" activa={paso === "informacion"} onClick={() => onElegir("informacion")} extra={<AvisoDeFicha clientId={clientId} />} />
        <FilaDeCuenta etiqueta="Procesos" activa={paso === "procesos"} onClick={() => onElegir("procesos")} />
      </div>
      <div data-recorrido="preventa.objeciones" className="lg:mt-auto">
        <BotonDeObjeciones onClick={abrirObjeciones} />
      </div>
    </nav>
  );
}
