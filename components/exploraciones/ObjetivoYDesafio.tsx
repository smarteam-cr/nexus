"use client";

/**
 * ObjetivoYDesafio — arriba del inicio de la Exploración (2026-11-07, Elías: «el usuario no rellena forms: valida o
 * modifica sugerencias»; los tres niveles, misma fecha). Ninguna tarjeta vacía para llenar:
 *   · El objetivo de la exploración: desde el 2026-11-08 (tercera vuelta) es el de Smarteam, fijo y general
 *     (lib/exploraciones/objetivo-y-hallazgos.ts). Debajo, su AJUSTE para esta empresa: el confirmado, o el que sugiere
 *     Nexus desde cómo llegó (la primera lectura) o desde los hallazgos de las sesiones (cada guía), para usar o descartar.
 *     La guía ya no lo espera.
 *   · Lo de la EMPRESA, de su ficha (Información del cliente): el desafío principal («Dolor principal») y el resultado del
 *     negocio (los resultados de sus proyectos o, en la preventa, su línea de «Retos estratégicos»). Si la ficha no los
 *     tiene, los propone Nexus y, al validarlos, van a la ficha como propuesta: ahí los confirma Customer Success.
 * Lo de la compra y lo de cada equipo explorado viven en el Resumen.
 */
import { useState } from "react";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { MAX_DESAFIO_PROPUESTO, MAX_OBJETIVO_DE_LA_EXPLORACION } from "@/lib/exploraciones/contexto-de-la-exploracion";
import { ajusteSugerido, objetivoDeSmarteam } from "@/lib/exploraciones/objetivo-y-hallazgos";
import { NOMBRE_DE_LA_VIA } from "@/lib/exploraciones/como-llego";
import { cn } from "@/lib/cn";
import { useLienzo } from "./contexto";
import { usePropuestaDelContexto } from "./ContextoDeLaPreparacion";
import { useSesiones } from "./useSesiones";

const CAMPO =
  "w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-[1.5] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none disabled:opacity-60";

/**
 * Una tarjeta que se valida: lo que ya vale (con de dónde sale y «Editar»), lo que sugiere Nexus (Usar · Editar ·
 * Descartar) o, si no hay nada, una línea para escribirlo.
 */
function TarjetaQueSeValida({
  rotulo,
  valido,
  sugerido,
  cargando,
  vacio,
  max,
  usar,
  descartar,
  editable = true,
}: {
  rotulo: string;
  valido: { texto: string; pie: string } | null;
  sugerido: { texto: string; pie: string } | null;
  cargando: boolean;
  vacio: string;
  max: number;
  usar: (texto: string) => Promise<boolean>;
  descartar?: () => Promise<boolean>;
  /** false: lo que vale no se cambia desde acá (el resultado que sale de los proyectos). */
  editable?: boolean;
}) {
  const { puedeEditar, guardando } = useLienzo();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ocupado = guardando || enviando;
  const correr = async (f: () => Promise<boolean>) => {
    setEnviando(true);
    try {
      if (await f()) setEditando(false);
    } finally {
      setEnviando(false);
    }
  };
  const abrir = (t: string) => {
    setTexto(t);
    setEditando(true);
  };

  if (editando) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-[18px] py-4">
        <p className={ROTULO_DEL_SISTEMA}>{rotulo}</p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={max} rows={3} autoFocus aria-label={rotulo} className={CAMPO} />
        <div className="flex justify-end gap-2">
          <BotonTexto onClick={() => setEditando(false)}>Cancelar</BotonTexto>
          <BotonAzul disabled={ocupado || !texto.trim()} onClick={() => void correr(() => usar(texto.trim()))}>
            Guardar
          </BotonAzul>
        </div>
      </section>
    );
  }
  if (valido) {
    return (
      <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-[18px] py-4">
        <div className="flex items-center gap-2">
          <p className={cn(ROTULO_DEL_SISTEMA, "flex-1")}>{rotulo}</p>
          {puedeEditar && editable && <BotonTexto onClick={() => abrir(valido.texto)}>Editar</BotonTexto>}
        </div>
        <p className="text-[15px] font-semibold leading-[1.4] text-fg">{valido.texto}</p>
        <p className="text-xs text-fg-muted">{valido.pie}</p>
      </section>
    );
  }
  if (sugerido) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-info-line bg-info-surface px-[18px] py-4">
        <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5 text-brand")}>
          <IconoDeSugerencia className="h-[13px] w-[13px]" />
          {rotulo} · lo sugiere Nexus
        </p>
        <p className="text-[15px] font-semibold leading-[1.4] text-fg">{sugerido.texto}</p>
        <p className="text-xs text-fg-muted">{sugerido.pie}</p>
        {puedeEditar && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {descartar && (
              <BotonTexto disabled={ocupado} onClick={() => void correr(descartar)}>
                Descartar
              </BotonTexto>
            )}
            <BotonBlanco disabled={ocupado} onClick={() => abrir(sugerido.texto)}>
              Editar
            </BotonBlanco>
            <BotonAzul disabled={ocupado} onClick={() => void correr(() => usar(sugerido.texto))}>
              Usar
            </BotonAzul>
          </div>
        )}
      </section>
    );
  }
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-[18px] py-3.5">
      <div className="min-w-0 flex-1">
        <p className={ROTULO_DEL_SISTEMA}>{rotulo}</p>
        <p className="mt-1 text-[13px] text-fg-muted">{cargando ? "Nexus está leyendo lo que ya sabe de la empresa…" : vacio}</p>
      </div>
      {puedeEditar && !cargando && <BotonBlanco onClick={() => abrir("")}>Escribirlo</BotonBlanco>}
    </section>
  );
}

/** Las tarjetas del objetivo y de la empresa, con la propuesta de Nexus. */
function useElContexto() {
  const { exp } = useLienzo();
  const cx = exp.estado.contenido.contexto;
  const propuesta = usePropuestaDelContexto(true);
  return { cx, ...propuesta };
}

/**
 * El objetivo de la exploración (2026-11-08, Elías): el de Smarteam, igual en todas, y debajo su ajuste para esta empresa.
 * El ajuste sugerido sale de cómo llegó y de los hallazgos de las sesiones; el vendedor lo usa, lo corrige o lo descarta.
 */
export function ObjetivoDeLaExploracion() {
  const { exp, marco, puedeEditar, guardando, cambiar, irA } = useLienzo();
  const { cx, proponiendo } = useElContexto();
  const [editando, setEditando] = useState<string | null>(null);
  const confirmado = cx?.objetivo.trim() ? cx : null;
  const sugerido = ajusteSugerido(exp.estado.propuesta, confirmado?.objetivo);
  const llego = exp.estado.contenido.comoLlego;
  // Lleva la sugerencia que se veía: solo esa sale de lo propuesto (una más nueva que llegó entretanto se queda).
  const guardar = (valor: string | null, exito: string) =>
    cambiar([{ op: "ajusteDelObjetivo", valor: valor?.slice(0, MAX_OBJETIVO_DE_LA_EXPLORACION) ?? null, vista: sugerido?.texto ?? null }], { exito }).then((ok) => {
      if (ok) setEditando(null);
      return ok;
    });
  const descartar = (texto: string) => cambiar([{ op: "descartarAjusteDelObjetivo", texto }]);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-[18px] py-4">
      <div className="space-y-1.5">
        <p className={ROTULO_DEL_SISTEMA}>Objetivo de la exploración</p>
        <p className="text-[15px] font-semibold leading-[1.4] text-fg">{objetivoDeSmarteam(marco.clave)}</p>
        <p className="text-xs text-fg-muted">El de Smarteam, igual en todas las exploraciones.</p>
      </div>
      <div className="space-y-2 border-t border-line pt-3">
        <div className="flex items-center gap-2">
          <p className={cn(ROTULO_DEL_SISTEMA, "flex-1")}>Para {exp.empresa.nombre}</p>
          {confirmado && puedeEditar && editando === null && (
            <>
              <BotonTexto disabled={guardando} onClick={() => void guardar(null, "Quitaste el ajuste: vale el objetivo de Smarteam.")}>
                Quitar
              </BotonTexto>
              <BotonTexto onClick={() => setEditando(confirmado.objetivo)}>Editar</BotonTexto>
            </>
          )}
        </div>
        {editando !== null ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={editando}
              onChange={(e) => setEditando(e.target.value)}
              maxLength={MAX_OBJETIVO_DE_LA_EXPLORACION}
              rows={3}
              autoFocus
              aria-label={`Ajuste del objetivo para ${exp.empresa.nombre}`}
              placeholder="Qué hay que enfocar o confirmar primero con esta empresa"
              className={CAMPO}
            />
            <div className="flex justify-end gap-2">
              <BotonTexto onClick={() => setEditando(null)}>Cancelar</BotonTexto>
              <BotonAzul disabled={guardando || !editando.trim()} onClick={() => void guardar(editando.trim(), "Ajuste del objetivo guardado.")}>
                Guardar
              </BotonAzul>
            </div>
          </div>
        ) : confirmado ? (
          <>
            <p className="text-sm leading-[1.5] text-fg">{confirmado.objetivo}</p>
            <p className="text-xs text-fg-muted">Ajuste confirmado{confirmado.por ? ` por ${confirmado.por}` : ""}. Vale para todas las sesiones.</p>
          </>
        ) : (
          !sugerido && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-[13px] text-fg-muted">
                {proponiendo ? "Nexus está leyendo lo que ya sabe de la empresa…" : "Sin ajuste: vale el objetivo de Smarteam. Nexus sugiere uno cuando cómo llegó o una sesión lo piden."}
              </p>
              {puedeEditar && !proponiendo && <BotonBlanco onClick={() => setEditando("")}>Ajustarlo</BotonBlanco>}
            </div>
          )
        )}
        {sugerido && editando === null && (
          <div className="flex flex-col gap-2 rounded-lg border border-info-line bg-info-surface px-3.5 py-3">
            <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5 text-brand")}>
              <IconoDeSugerencia className="h-[13px] w-[13px]" />
              {confirmado ? "Nexus sugiere cambiar el ajuste" : "Nexus sugiere un ajuste"}
            </p>
            <p className="text-sm font-semibold leading-[1.45] text-fg">{sugerido.texto}</p>
            <p className="text-xs text-fg-muted">
              {sugerido.porque
                ? `Por qué: ${sugerido.porque}`
                : sugerido.de === "llegada"
                  ? `Sale de cómo llegó${llego ? ` (${NOMBRE_DE_LA_VIA[llego.via].toLowerCase()})` : ""} y de lo que Nexus ya sabe de la empresa.`
                  : "Sale de los hallazgos de las sesiones."}
            </p>
            {puedeEditar && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <BotonTexto disabled={guardando} onClick={() => void descartar(sugerido.texto)}>
                  Descartar
                </BotonTexto>
                <BotonBlanco disabled={guardando} onClick={() => setEditando(sugerido.texto)}>
                  Editar
                </BotonBlanco>
                <BotonAzul disabled={guardando} onClick={() => void guardar(sugerido.texto, "Ajuste del objetivo guardado.")}>
                  Usar
                </BotonAzul>
              </div>
            )}
          </div>
        )}
        {marco.clave !== "cs" && !llego && (
          <p className="text-xs text-fg-muted">
            Para que el ajuste tenga en cuenta cómo llegó el lead,{" "}
            <button type="button" className="text-brand hover:underline" onClick={() => irA("preparacion")}>
              confírmalo en Preparación
            </button>
            .
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Arriba del inicio: el objetivo de la exploración y lo de la EMPRESA (su ficha). Lo de la compra y lo de cada equipo
 * explorado viven en el Resumen: acá solo se dice dónde.
 */
export default function ObjetivoYDesafio() {
  const { marco, irA } = useLienzo();
  const { todas } = useSesiones();
  const toast = useToast();
  const { propuesto, empresa, proponiendo, validarEnLaFicha } = useElContexto();

  // El desafío que dejó escrito una sesión (2026-11-06, a mano o con «Proponer desde la reunión»): ya lo validó alguien.
  const deUnaSesion = [...todas].reverse().find((p) => p.sesion?.desafio?.texto) ?? null;
  const desafioSugerido = propuesto?.desafio
    ? { texto: propuesto.desafio, pie: "Sale de lo que Nexus ya sabe de la empresa. Al usarlo, va a la ficha de la empresa." }
    : deUnaSesion?.sesion?.desafio
      ? { texto: deUnaSesion.sesion.desafio.texto, pie: `Lo dejó escrito la sesión ${deUnaSesion.numero}. Al usarlo, va a la ficha de la empresa.` }
      : null;
  const resultadoSugerido = propuesto?.resultado ? { texto: propuesto.resultado, pie: "Sale de lo que Nexus ya sabe de la empresa. Al usarlo, va a la ficha de la empresa." } : null;
  const aLaFicha = (que: "desafio" | "resultado") => async (texto: string) => {
    const error = await validarEnLaFicha(que, texto);
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success("Quedó en la ficha de la empresa, para que Customer Success lo confirme.", {
      action: { label: "Ver Información del cliente", onClick: () => irA("informacion") },
    });
    return true;
  };
  const descartar = (que: "desafio" | "resultado") => async () => {
    const error = await validarEnLaFicha(que, null);
    if (error) toast.error(error);
    return !error;
  };
  const deLaFicha = (x: { texto: string; confirmado: boolean; deLosProyectos?: true } | null | undefined) =>
    x
      ? {
          texto: x.texto,
          pie: x.deLosProyectos
            ? "De los resultados confirmados de sus proyectos (Información del cliente)."
            : x.confirmado
              ? "De la ficha de la empresa (Información del cliente)."
              : "En la ficha de la empresa, esperando que Customer Success lo confirme.",
        }
      : null;

  return (
    <div className="flex flex-col gap-3">
      <ObjetivoDeLaExploracion />
      <p className={cn(ROTULO_DEL_SISTEMA, "mt-1")}>La empresa · de su ficha</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <TarjetaQueSeValida
          rotulo="Desafío principal"
          valido={deLaFicha(empresa?.desafio)}
          sugerido={desafioSugerido}
          cargando={proponiendo}
          vacio="La ficha de la empresa no lo tiene y Nexus todavía no tiene de dónde sugerirlo: sale de las sesiones."
          max={MAX_DESAFIO_PROPUESTO}
          usar={aLaFicha("desafio")}
          descartar={propuesto?.desafio ? descartar("desafio") : undefined}
        />
        <TarjetaQueSeValida
          rotulo="Resultado del negocio"
          valido={deLaFicha(empresa?.resultado)}
          sugerido={resultadoSugerido}
          cargando={proponiendo}
          vacio="La ficha de la empresa no lo tiene y Nexus todavía no tiene de dónde sugerirlo: sale de las sesiones."
          max={MAX_DESAFIO_PROPUESTO}
          usar={aLaFicha("resultado")}
          editable={!empresa?.resultado?.deLosProyectos}
          descartar={propuesto?.resultado ? descartar("resultado") : undefined}
        />
      </div>
      {marco.clave !== "cs" && (
        <p className="text-[13px] text-fg-muted">
          Lo de la compra (plazos, presupuesto, quién decide, qué pasa si no hacen nada y qué cambia si lo logran) y los retos y lo que busca cada equipo están en el{" "}
          <button type="button" className="text-brand hover:underline" onClick={() => irA("resumen")}>
            Resumen
          </button>
          .
        </p>
      )}
    </div>
  );
}
