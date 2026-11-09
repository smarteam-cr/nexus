"use client";

/**
 * LoQueQueda — «Lo que queda para la próxima» de una sesión que ya pasó (2026-11-07, lib/exploraciones/despues-de-la-sesion.ts).
 *
 * UNA lista que junta lo que antes eran tres bloques («Quedó abierto», «Lo que falta para confirmarlo» y «Temas por
 * retomar»): lo que la lectura dejó pendiente, lo que no se preguntó, lo que el cliente dijo y nadie siguió y lo que
 * dejaron las sesiones escritas a mano. Todo va marcado; se desmarca lo que no va (`SesionPlaneada.noLlevar`). Lo marcado
 * entra a la guía de la siguiente sesión y arma su objetivo (`useObjetivosDeLaSiguiente`, que usa la Preparación). Nada
 * que escribir.
 */
import { claveDeLaReunion, type ItemPropuesto } from "@/lib/exploraciones/contenido";
import { NOMBRE_DE_LA_TARJETA, porAveriguar } from "@/lib/exploraciones/contexto-de-la-exploracion";
import {
  DE_DONDE_SALE,
  esDeLaReunion,
  loQueQuedaParaLaProxima,
  objetivosSugeridosDeLaSiguiente,
  type PendienteDeLaSesion,
} from "@/lib/exploraciones/despues-de-la-sesion";
import { separarPregunta, type PestanaDeSesion } from "@/lib/exploraciones/guia";
import type { PreguntaConOpciones } from "@/lib/exploraciones/objetivo-y-hallazgos";
import { resultadoAveriguado } from "@/lib/exploraciones/resultado";
import { esLaPrimeraSinAnterior } from "@/lib/exploraciones/objetivos-de-la-primera";
import { useEffect, useState } from "react";
import { useLienzo } from "./contexto";
import { useEditarLaSesion } from "./piezas-de-la-sesion";
import { useSesiones } from "./useSesiones";

/** Lo que queda de una sesión (o de ninguna, con null), y las sugerencias de «lo que nadie siguió» que entran en la lista. */
export function useLoQueQueda(pestana: PestanaDeSesion | null): { pendientes: PendienteDeLaSesion[]; sugeridas: ItemPropuesto[] } {
  const { exp, pendientesPara } = useLienzo();
  const { todas } = useSesiones();
  if (!pestana) return { pendientes: [], sugeridas: [] };
  const s = pestana.sesion;
  const r = pestana.reunion;
  const lectura = r ? (exp.estado.propuesta.lecturas[claveDeLaReunion(r)] ?? null) : null;
  const sugeridas = pendientesPara((d) => d.tipo === "casilla" && d.clave === "noExplorado").filter((it) => esDeLaReunion(it, lectura, r?.titulo ?? null));
  // Lo que se confirmó en «lo que nadie siguió» es de la última sesión que pasó (la casilla es de toda la exploración).
  const ultimaHecha = [...todas].reverse().find((p) => p.hecha && !p.noSeHizo);
  const confirmados = ultimaHecha?.clave === pestana.clave ? ((exp.estado.contenido.casillas.noExplorado as string[] | undefined) ?? []) : [];
  const agenda = s ? exp.estado.propuesta.guias[s.id]?.agenda : undefined;
  const pendientes = loQueQuedaParaLaProxima({
    sesion: s,
    lectura,
    noSeSiguio: [...sugeridas.map((it) => ({ texto: String(it.valor), itemId: it.id })), ...confirmados.map((texto) => ({ texto }))],
    resultadoSinMarcar: resultadoAveriguado(agenda, s?.hechas) === false,
  });
  return { pendientes, sugeridas };
}

/**
 * El objetivo que Nexus sugiere para esta sesión desde lo que dejó la anterior que ya pasó y lo que la exploración
 * todavía no sabe (sin IA: sale de la lectura que ya se hizo). null si no hay una anterior o no dejó nada.
 */
export function useObjetivosDeLaSiguiente(pestana: PestanaDeSesion): string[] {
  const { exp } = useLienzo();
  const { todas } = useSesiones();
  const i = todas.findIndex((p) => p.clave === pestana.clave);
  const anterior = [...todas.slice(0, i < 0 ? todas.length : i)].reverse().find((p) => p.hecha && !p.noSeHizo) ?? null;
  const { pendientes } = useLoQueQueda(anterior);
  const falta = usePorAveriguar();
  if (pestana.hecha) return [];
  // La primera no tiene anterior: los suyos los sugirió Nexus con lo que sabe de la empresa (2026-11-08).
  if (!anterior) return exp.estado.propuesta.objetivosDeLaPrimera?.objetivos ?? [];
  const lectura = anterior.reunion ? exp.estado.propuesta.lecturas[claveDeLaReunion(anterior.reunion)] : undefined;
  // Séptima vuelta: hasta tres, para elegir en tarjetas.
  return objetivosSugeridosDeLaSiguiente({
    pendientes,
    objetivoSiguiente: lectura?.objetivoSiguiente ?? null,
    objetivosSiguientes: lectura?.objetivosSiguientes ?? null,
    porAveriguar: falta,
  });
}

/** Los objetivos de la primera que se pidieron en esta pestaña del navegador, por preventa (gasta IA: una vez). */
const OBJETIVOS_PEDIDOS = new Map<string, "pidiendo" | "listo" | "fallo">();

/**
 * Los tres objetivos de la PRIMERA sesión (2026-11-08, lib/exploraciones/objetivos-de-la-primera.ts): si es la primera, no
 * tiene objetivo y nunca se pidieron, se piden UNA vez (el servidor tampoco los repite) y se recarga. `pensando` mientras.
 */
export function useObjetivosDeLaPrimera(pestana: PestanaDeSesion): { primera: boolean; pensando: boolean; fallo: boolean } {
  const { exp, puedeEditar, recargar } = useLienzo();
  const { todas } = useSesiones();
  const primera = esLaPrimeraSinAnterior(todas, pestana.clave, pestana.hecha);
  const falta = primera && !pestana.sesion?.objetivo?.trim() && !exp.estado.propuesta.objetivosDeLaPrimera;
  // Solo para volver a pintar cuando termina el pedido (el estado vive en OBJETIVOS_PEDIDOS).
  const [, setVuelta] = useState(0);
  useEffect(() => {
    if (!falta || !puedeEditar || OBJETIVOS_PEDIDOS.has(exp.id)) return;
    OBJETIVOS_PEDIDOS.set(exp.id, "pidiendo");
    // Si falla (presupuesto, el servidor), queda «Escribe el tuyo» y se dice que falló, no que no había de dónde.
    void fetch(`/api/sales/exploraciones/${exp.id}/objetivos-de-la-primera`, { method: "POST" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        await recargar();
        OBJETIVOS_PEDIDOS.set(exp.id, "listo");
      })
      .catch(() => OBJETIVOS_PEDIDOS.set(exp.id, "fallo"))
      .finally(() => setVuelta((v) => v + 1));
  }, [falta, puedeEditar, exp.id, recargar]);
  const estado = OBJETIVOS_PEDIDOS.get(exp.id);
  return { primera, pensando: falta && puedeEditar && (!estado || estado === "pidiendo"), fallo: falta && estado === "fallo" };
}

/**
 * Lo que la lectura de la sesión anterior que ya pasó dejó para preguntarle al vendedor antes de armar la guía de esta
 * (sexta vuelta, 2026-11-08): la misma llamada que sugiere el objetivo. Las lecturas de antes no lo tienen.
 */
export function usePreguntasDeLaAnterior(pestana: PestanaDeSesion): PreguntaConOpciones[] {
  const { exp } = useLienzo();
  const { todas } = useSesiones();
  if (pestana.hecha) return [];
  const i = todas.findIndex((p) => p.clave === pestana.clave);
  const anterior = [...todas.slice(0, i < 0 ? todas.length : i)].reverse().find((p) => p.hecha && !p.noSeHizo) ?? null;
  const lectura = anterior?.reunion ? exp.estado.propuesta.lecturas[claveDeLaReunion(anterior.reunion)] : undefined;
  return lectura?.preguntasParaLaSiguiente ?? [];
}

/** Lo que la exploración todavía tiene por averiguar de «lo que ya sabemos» («Presupuesto», «Quién decide»). */
export function usePorAveriguar(): string[] {
  const { exp } = useLienzo();
  const cx = exp.estado.contenido.contexto;
  return cx?.tarjetas ? porAveriguar(cx.tarjetas).map((k) => NOMBRE_DE_LA_TARJETA[k]) : [];
}

/** Cómo se lee un pendiente: lo que el cliente dijo y nadie siguió trae «Qué preguntar»; se muestra la pregunta. */
function titulos(p: PendienteDeLaSesion): { titulo: string; sub: string } {
  const { dicho, pregunta } = separarPregunta(p.texto);
  const de = DE_DONDE_SALE[p.de];
  if (p.de === "noSeSiguio" && pregunta) return { titulo: pregunta, sub: `${de}: ${dicho}` };
  return { titulo: p.texto, sub: p.detalle ? `${de} · ${p.detalle}` : de };
}

export function LoQueQuedaParaLaProxima({ pestana, numeroSiguiente }: { pestana: PestanaDeSesion; numeroSiguiente: number }) {
  const { exp, cambiar, puedeEditar, guardando } = useLienzo();
  const editar = useEditarLaSesion(pestana, "despues");
  const { pendientes } = useLoQueQueda(pestana);
  if (!pendientes.length) return null;
  const marcados = pendientes.filter((p) => p.marcado).length;
  const alternar = (p: PendienteDeLaSesion) => {
    /* Lo que el cliente dijo y nadie siguió, ya confirmado, vive en su casilla y la guía lo lee de ahí: tacharlo lo saca
       de la casilla (el «Quitar» de antes). Se deshace con Ctrl+Z. */
    if (p.de === "noSeSiguio" && !p.itemId) {
      const resto = ((exp.estado.contenido.casillas.noExplorado as string[] | undefined) ?? []).filter((t) => t.trim() !== p.texto);
      void cambiar([{ op: "casilla", clave: "noExplorado", valor: resto.length ? resto : null }]);
      return;
    }
    void editar((x) => {
      const fuera = new Set(x.noLlevar ?? []);
      if (fuera.has(p.clave)) fuera.delete(p.clave);
      else fuera.add(p.clave);
      const { noLlevar: _antes, ...resto } = x;
      void _antes;
      return fuera.size ? { ...resto, noLlevar: [...fuera].slice(-30) } : resto;
    });
  };
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-[18px] py-3.5">
        <h3 className="text-[15px] font-semibold text-fg">Lo que queda para la próxima</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">
          {marcados === pendientes.length
            ? `Todo va a la sesión ${numeroSiguiente}: entra en su guía y arma su objetivo. Desmarca lo que no va.`
            : `${marcados} de ${pendientes.length} van a la sesión ${numeroSiguiente}: entran en su guía y arman su objetivo.`}
        </p>
      </header>
      <ul>
        {pendientes.map((p) => {
          const t = titulos(p);
          return (
            <li key={p.clave} className="flex items-start gap-3 border-b border-surface-hover px-[18px] py-3 last:border-b-0">
              <input
                type="checkbox"
                checked={p.marcado}
                disabled={!puedeEditar || guardando}
                aria-label={`Llevar «${t.titulo}» a la sesión ${numeroSiguiente}`}
                onChange={() => alternar(p)}
                className="mt-[3px] h-4 w-4 flex-shrink-0 accent-brand"
              />
              <div className="min-w-0 flex-1">
                <p className={p.marcado ? "text-sm font-semibold text-fg" : "text-sm text-fg-muted line-through"}>{t.titulo}</p>
                <p className="mt-0.5 text-xs text-fg-muted">{t.sub}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
