"use client";

/**
 * ObjetivoYDesafio — arriba del inicio de la Exploración (2026-11-07, Elías: «el usuario no rellena forms: valida o
 * modifica sugerencias»). Dos tarjetas, ninguna vacía para llenar:
 *   · El objetivo de la exploración: lo confirmado o, si no hay, el que sugiere Nexus con lo que ya sabe (el traspaso,
 *     cómo llegó, las notas de HubSpot, las reuniones). Se usa tal cual o se corrige. Lo pide una sola vez por exploración
 *     (`usePropuestaDelContexto`, la misma llamada que «lo que ya sabemos»).
 *   · El desafío principal: se lee de la ficha de la empresa (Información del cliente › «Dolor principal»). Si la ficha
 *     no lo tiene, lo propone Nexus (o se ofrece el que dejó escrito una sesión) y, al validarlo, va a la ficha como
 *     propuesta: ahí lo confirma Customer Success, como todo lo que llega a la ficha.
 */
import { useState } from "react";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { MAX_DESAFIO_PROPUESTO, MAX_OBJETIVO_DE_LA_EXPLORACION } from "@/lib/exploraciones/contexto-de-la-exploracion";
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
}: {
  rotulo: string;
  valido: { texto: string; pie: string } | null;
  sugerido: { texto: string; pie: string } | null;
  cargando: boolean;
  vacio: string;
  max: number;
  usar: (texto: string) => Promise<boolean>;
  descartar?: () => Promise<boolean>;
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
          {puedeEditar && <BotonTexto onClick={() => abrir(valido.texto)}>Editar</BotonTexto>}
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

export default function ObjetivoYDesafio() {
  const { exp, cambiar, marco } = useLienzo();
  const { todas } = useSesiones();
  const toast = useToast();
  const cx = exp.estado.contenido.contexto;
  const { leida, proponiendo, validarDesafio } = usePropuestaDelContexto(true);
  const propuesto = leida?.propuesto ?? null;

  const usarObjetivo = (texto: string) =>
    cambiar([{ op: "contexto", valor: { objetivo: texto.slice(0, MAX_OBJETIVO_DE_LA_EXPLORACION), ...(cx?.sabemos ? { sabemos: cx.sabemos } : {}), ...(cx?.tarjetas ? { tarjetas: cx.tarjetas } : {}) } }], {
      exito: "Objetivo de la exploración confirmado.",
    });

  // El desafío que dejó escrito una sesión (2026-11-06, a mano o con «Proponer desde la reunión»): ya lo validó alguien.
  const deUnaSesion = [...todas].reverse().find((p) => p.sesion?.desafio?.texto) ?? null;
  const ficha = leida?.desafioDeLaFicha ?? null;
  const desafioSugerido = propuesto?.desafio
    ? { texto: propuesto.desafio, pie: "Sale de lo que Nexus ya sabe de la empresa. Al usarlo, va a la ficha de la empresa." }
    : deUnaSesion?.sesion?.desafio
      ? { texto: deUnaSesion.sesion.desafio.texto, pie: `Lo dejó escrito la sesión ${deUnaSesion.numero}. Al usarlo, va a la ficha de la empresa.` }
      : null;
  const usarDesafio = async (texto: string) => {
    const ok = await validarDesafio(texto);
    if (ok) toast.success("Quedó en la ficha de la empresa, para que Customer Success lo confirme.");
    else toast.error("No se pudo guardar en la ficha de la empresa. Vuelve a intentarlo.");
    return ok;
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <TarjetaQueSeValida
        rotulo="Objetivo de la exploración"
        valido={cx?.objetivo.trim() ? { texto: cx.objetivo, pie: `Confirmado${cx.por ? ` por ${cx.por}` : ""}. Todas las sesiones dependen de este objetivo.` } : null}
        sugerido={propuesto?.objetivo ? { texto: propuesto.objetivo, pie: "Sale de lo que Nexus ya sabe de la empresa. Úsalo tal cual o corrígelo." } : null}
        cargando={proponiendo}
        vacio={
          marco.clave === "cs"
            ? "Nexus no tiene todavía de dónde sugerirlo: ¿para qué exploramos esta cuenta?"
            : "Nexus no tiene todavía de dónde sugerirlo: ¿por qué exploramos esta empresa y qué queremos lograr?"
        }
        max={MAX_OBJETIVO_DE_LA_EXPLORACION}
        usar={usarObjetivo}
      />
      <TarjetaQueSeValida
        rotulo="Desafío principal"
        valido={
          ficha
            ? { texto: ficha.texto, pie: ficha.confirmado ? "De la ficha de la empresa (Información del cliente)." : "En la ficha de la empresa, esperando que Customer Success lo confirme." }
            : null
        }
        sugerido={desafioSugerido}
        cargando={proponiendo}
        vacio="La ficha de la empresa no lo tiene y Nexus todavía no tiene de dónde sugerirlo: sale de las sesiones."
        max={MAX_DESAFIO_PROPUESTO}
        usar={usarDesafio}
        descartar={propuesto?.desafio ? () => validarDesafio(null) : undefined}
      />
    </div>
  );
}
