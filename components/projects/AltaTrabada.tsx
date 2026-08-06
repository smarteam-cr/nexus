"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/hooks/useMe";
import {
  EXPLICACION_DEL_PASO,
  MIENTRAS_TANTO,
  parseEstadoDeAlta,
  siguientePaso,
} from "@/lib/projects/alta";

/**
 * components/projects/AltaTrabada.tsx — EL CARTEL del alta que quedó a medio hacer.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Dar de alta un proyecto son dos escrituras en dos sistemas, con red en el medio. Cuando la
 * segunda falla, el proyecto queda en cuarentena: se ve y se abre, pero no cobra, no suma a
 * la cartera y no se le publica nada al cliente. Sin este cartel, esa cuarentena sería
 * indistinguible de un bug — el proyecto aparece, se abre, y simplemente no está en cobranza.
 *
 * ── EN DOS LUGARES, A PROPÓSITO ──────────────────────────────────────────────
 * El rail de la ficha del cliente y el widget del proyecto. El del rail es el que importa: el
 * widget vive DENTRO de un proyecto ya abierto, así que solo con ése un alta trabada se
 * descubre de casualidad — hay que entrar justo al proyecto que falló.
 *
 * El texto no vive acá sino en `lib/projects/alta.ts`: dos carteles con textos casi iguales se
 * desincronizan, y el que se corrige nunca es el que la persona está mirando.
 */

export interface AltaTrabadaProps {
  projectId: string;
  /** `Project.altaEstado`. Si el alta terminó (o nunca hubo una), el componente no pinta nada. */
  altaEstado: string | null | undefined;
  /** `Project.altaError` — el motivo del último intento fallido, si lo hubo. */
  altaError?: string | null;
  /** `Project.altaUltimoIntentoAt` en ISO. */
  altaUltimoIntentoAt?: string | null;
  /** `Project.altaIntentos`. Se muestra recién a partir del segundo: uno solo no dice nada. */
  altaIntentos?: number | null;
  /** `Project.altaActorEmail` — quién empezó el alta. Ver `habilitado`. */
  altaActorEmail?: string | null;
  /**
   * ¿Esta persona puede dar de alta? Sin la celda, ve el cartel pero no el botón.
   *
   * ⚠ Por defecto NO es `true`: se deriva del permiso real. El default optimista hacía que un
   * CSE —el rol que más fichas de clientes abre— y Marketing vieran un botón que les devuelve un
   * 403, y el texto crudo del permiso se pintaba en el lugar donde va el motivo del alta trabada.
   * Ninguno de los dos llamadores pasaba el prop, así que el default ERA el comportamiento.
   */
  puedeReintentar?: boolean;
  /** Qué hacer cuando el alta TERMINA. Por defecto, recargar. */
  onTermino?: () => void;
  /** `compacto` en el rail (una línea + botón); `completo` en el widget. */
  variante?: "compacto" | "completo";
}

function haceCuanto(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export default function AltaTrabada({
  projectId,
  altaEstado,
  altaError,
  altaUltimoIntentoAt,
  altaIntentos,
  altaActorEmail,
  puedeReintentar,
  onTermino,
  variante = "completo",
}: AltaTrabadaProps) {
  const router = useRouter();
  const me = useMe();
  const [corriendo, setCorriendo] = useState(() => enVuelo.has(projectId));
  const [fallo, setFallo] = useState<string | null>(null);
  /** Si esta persona ya reintentó en esta pantalla. Cambia el rótulo del botón: es la señal más
      barata de que el click hizo algo, cuando el motivo del fallo vuelve idéntico. */
  const [corrio, setCorrio] = useState(false);

  /* Las DOS instancias del cartel comparten el estado de «está corriendo». Sin esto, deshabilitar
     el botón del rail dejaba clickeable el del widget. Ver el comentario de `enVuelo`. */
  useEffect(() => {
    /* ⚠ Se RE-SINCRONIZA, no solo se suscribe: en el rail del cliente el cartel no lleva `key` y
       `projectId` cambia al saltar de pestaña de proyecto SIN remontar. Sin este reset, el
       «Último error» del proyecto anterior queda pintado sobre el nuevo, y el botón puede
       aparecer deshabilitado por una corrida que es de otro proyecto. */
    setCorriendo(enVuelo.has(projectId));
    setFallo(null);
    setCorrio(false);
    return suscribir(projectId, () => setCorriendo(enVuelo.has(projectId)));
  }, [projectId]);

  /**
   * ── QUIÉN VE EL BOTÓN, Y POR QUÉ NO ES SOLO EL PERMISO ──────────────────────
   * El default es el permiso y no `true`: con `true`, el CSE —el rol que más fichas de clientes
   * abre— veía un botón que le devuelve 403 y el texto crudo del permiso se pintaba en el lugar
   * donde va el motivo del alta trabada.
   *
   * ⚠ Pero el permiso solo tampoco alcanza: `POST /api/clients/traer-de-hubspot` lo puede
   * apretar cualquier miembro del equipo, así que quien trae una empresa puede no tener la
   * celda. Si el espejo falla justo ahí, esa persona se queda mirando un cartel sin salida
   * sobre algo que ella misma creó. El servidor ya deja terminar a quien empezó
   * (`alta/retry/route.ts`); esta línea es la misma regla, dicha en la pantalla.
   */
  const laEmpezoEstaPersona =
    !!altaActorEmail && !!me?.email && altaActorEmail.toLowerCase() === me.email.toLowerCase();
  const habilitado =
    puedeReintentar ?? (me?.permissions.sections.proyectos?.create === true || laEmpezoEstaPersona);

  /* El estado llega como string suelto (viaja por JSON y por props de server component), así
     que se valida contra la tabla en vez de castearse: un valor que nadie declaró tiene que
     comportarse como "no hay alta", no reventar el rail entero del cliente. */
  const paso = siguientePaso(parseEstadoDeAlta(altaEstado));
  // El alta terminó, o el proyecto nunca pasó por el alta única (los ~100 de siempre).
  if (!paso) return null;

  const { titulo, detalle } = EXPLICACION_DEL_PASO[paso];

  async function reintentar() {
    // El guardia del doble click, del lado de acá. El de verdad está en el servidor
    // (`avanzarAlta` reclama la fila); éste evita gastar el viaje.
    if (enVuelo.has(projectId)) return;
    marcar(projectId, true);
    setFallo(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/alta/retry`, { method: "POST" });
      const data = (await r.json()) as { termino?: boolean; error?: string | null };
      if (!r.ok) {
        setFallo(data.error || "No se pudo reintentar.");
        return;
      }
      if (data.termino) {
        /* Terminó: la pantalla entera tiene que releerse. El proyecto acaba de entrar en
           cobranza, en la cartera y en el ciclo de vida — media docena de bloques que se
           cargaron creyendo que estaba en cuarentena. Recargar es lo honesto. */
        if (onTermino) onTermino();
        else window.location.reload();
        return;
      }
      /* No terminó: el motor dejó el motivo escrito en la fila. Se muestra el que devolvió
         en vez de recargar, para que la persona lea qué pasó sin perder el contexto. */
      setFallo(data.error || "Sigue sin poder completarse. Probá de nuevo en un momento.");
      setCorrio(true);
    } catch {
      setFallo("No se pudo hablar con el servidor.");
    } finally {
      marcar(projectId, false);
      /**
       * ⚠ EL REFRESCO DEL CASO QUE FALLA, que es el que faltaba.
       *
       * Cuando el reintento vuelve a fallar con el MISMO motivo, `setFallo(mismo string)` no
       * cambia un solo carácter del DOM: el cartel queda byte por byte idéntico al de antes del
       * click, con el contador de intentos y el «hace X» viejos. Es exactamente lo que se
       * reportó — «le doy varias veces y no pasa nada» — y llevaba a pensar que el botón estaba
       * roto, cuando en realidad sí corría y sí pegaba contra HubSpot.
       *
       * `router.refresh()` trae de vuelta `altaIntentos` y `altaUltimoIntentoAt` del servidor,
       * que son las dos cosas que SÍ cambiaron.
       */
      router.refresh();
    }
  }

  const boton = habilitado ? (
    <button
      type="button"
      onClick={reintentar}
      disabled={corriendo}
      className="flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-lg border border-warn-line text-warn-ink hover:bg-warn-line/20 disabled:opacity-50 transition-colors"
    >
      {corriendo ? "Reintentando…" : corrio ? "Reintentar de nuevo" : "Reintentar"}
    </button>
  ) : null;

  if (variante === "compacto") {
    return (
      <div className="px-6 py-2 flex items-center gap-2 flex-wrap border-b border-warn-line bg-warn-surface">
        <span className="text-xs font-medium text-warn-ink">Sin terminar de crear · {titulo}</span>
        <span className="text-xs text-warn-ink/70" title={`${detalle} ${MIENTRAS_TANTO}`}>
          · no cobra ni se publica
        </span>
        {fallo && <span className="text-xs text-warn-ink/70">· {fallo}</span>}
        <span className="ml-auto" />
        {boton}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-warn-line bg-warn-surface p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-warn-ink">{titulo}</p>
          <p className="mt-1 text-xs text-warn-ink/80 leading-relaxed">{detalle}</p>
          <p className="mt-1 text-xs text-warn-ink/70 leading-relaxed">{MIENTRAS_TANTO}</p>
        </div>
        {boton}
      </div>

      {(altaError || fallo || altaUltimoIntentoAt) && (
        <div className="pt-2 border-t border-warn-line/60 space-y-1">
          {(fallo || altaError) && (
            /* El error crudo se muestra igual, abajo y en chico: no le sirve a quien solo
               quiere saber si esperar, pero es LO ÚNICO que sirve cuando hay que avisar. */
            <p className="text-xs text-warn-ink/70 break-words">Último error: {fallo || altaError}</p>
          )}
          {altaUltimoIntentoAt && (
            <p className="text-xs text-warn-ink/60">
              Último intento {haceCuanto(altaUltimoIntentoAt)}
              {typeof altaIntentos === "number" && altaIntentos > 1 ? ` · ${altaIntentos} intentos` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ── QUÉ ALTAS ESTÁN CORRIENDO, COMPARTIDO ENTRE LAS DOS INSTANCIAS DEL CARTEL ───────────────
 *
 * El cartel se monta DOS VECES en la misma pantalla, a propósito: compacto en el rail de la
 * ficha del cliente y completo dentro del widget del proyecto. Con el estado de «corriendo»
 * local a cada uno, deshabilitar el primer botón dejaba el segundo clickeable, y dos POST
 * concurrentes sobre un alta en `pendiente_crm` entraban los dos por la rama que CREA en HubSpot:
 * dos records gemelos del mismo proyecto, que después hay que unir a mano allá.
 *
 * Vive a nivel de módulo y no en un contexto porque los dos carteles NO comparten un ancestro
 * pensado para esto: el rail lo pinta el layout del cliente y el widget vive dentro de la página.
 * Un contexto nuevo para dos consumidores es más ceremonia que la que el problema pide.
 */
const enVuelo = new Set<string>();
const oyentes = new Map<string, Set<() => void>>();

function suscribir(projectId: string, cb: () => void): () => void {
  const set = oyentes.get(projectId) ?? new Set();
  set.add(cb);
  oyentes.set(projectId, set);
  return () => {
    set.delete(cb);
    if (set.size === 0) oyentes.delete(projectId);
  };
}

function marcar(projectId: string, corriendo: boolean) {
  if (corriendo) enVuelo.add(projectId);
  else enVuelo.delete(projectId);
  for (const cb of oyentes.get(projectId) ?? []) cb();
}
