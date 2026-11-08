"use client";

/**
 * EquipoDeLaSesion — con qué equipo del cliente es una sesión (2026-10-23, docs/preventa-por-area-plan.md): Marketing,
 * Servicio al cliente, Tecnología… Va en la cabecera de la sesión, debajo de su fecha. Con un equipo, la guía pregunta
 * como se le pregunta a ese equipo (lib/exploraciones/equipos.ts) y por las dimensiones de su área.
 *
 * Nexus sugiere el equipo por el título de la sesión o del calendario («¿Es con Marketing?»); nunca lo guarda solo. Elegir
 * un equipo cuya área de la escala no está en juego la suma en el mismo cambio: así lo que diga ese equipo llega a su área
 * y no a la de Ventas (pasó con CEMACO: todo lo de marketing quedó atado a dimensiones de Ventas).
 *
 * K11 (2026-10-28): una ⓘ dice qué cambia al elegirlo; la sugerencia dice de dónde sale y se usa con un clic; y al
 * cambiarlo en una sesión ya preparada, leída o analizada, Nexus SUGIERE rehacer lo que aplique (al-cambiar-el-equipo.ts),
 * con los botones de siempre. Nada corre solo: cada cosa gasta IA y la decide quien lleva la sesión.
 */
import { useState } from "react";
import { Menu } from "@/components/ui/Menu";
import { useToast } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { fraseAlCambiarElEquipo, queRehacerAlCambiarElEquipo, type QueRehacer } from "@/lib/exploraciones/al-cambiar-el-equipo";
import { claveDeLaReunion } from "@/lib/exploraciones/contenido";
import { areaQueSuma, DE_DONDE_SALE_EL_EQUIPO, EQUIPOS, EQUIPOS_DEL_CLIENTE, sugerirEquipoDeLaSesion, type ClaveDeEquipo } from "@/lib/exploraciones/equipos";
import type { PestanaDeSesion, SesionPlaneada } from "@/lib/exploraciones/guia";
import type { Operacion } from "@/lib/exploraciones/contenido";
import { useAnalisisDeLaVenta } from "@/components/analizador-venta/useAnalisisDeLaVenta";
import { useLienzo, type MomentoDeLaSesion } from "./contexto";
import { useEditarLaSesion } from "./piezas-de-la-sesion";
import { useCorrida } from "./useCorrida";
import { useSesiones } from "./useSesiones";

function sinEquipo(s: SesionPlaneada): SesionPlaneada {
  const { equipo: _antes, ...resto } = s;
  void _antes;
  return resto;
}

/** Qué cambia al elegir el equipo, para la ⓘ (en un proyecto no hay análisis de la venta). */
function queCambia(enProyecto: boolean): string {
  return `Elegir el equipo cambia la guía de preguntas (se le pregunta como a ese equipo), la lectura de la reunión y su lugar en la escala (lo que cuenta ese equipo va a las dimensiones de su área)${enProyecto ? "" : " y el análisis de la sesión"}. Nexus lo sugiere por el título; nunca lo elige solo.`;
}

export function EquipoDeLaSesion({ pestana, momento }: { pestana: PestanaDeSesion; momento: MomentoDeLaSesion }) {
  const { exp, escala, marco, puedeEditar, guardando } = useLienzo();
  const editar = useEditarLaSesion(pestana, momento);
  const actual = pestana.sesion?.equipo ?? null;
  const sugerido = actual ? null : sugerirEquipoDeLaSesion(pestana);
  /* Por sesión (su clave): si la persona le acaba de cambiar el equipo en esta pantalla, lo que ya rehízo y si cerró el
     aviso. Vive en la pantalla: al volver a abrirla, solo queda lo que se sabe de los datos (la lectura de otro equipo). */
  const [avisos, setAvisos] = useState<Record<string, { recien: boolean; listo: QueRehacer[]; cerrado?: boolean }>>({});
  const aviso = avisos[pestana.clave] ?? { recien: false, listo: [] };
  const conAviso = (clave: string, f: (a: typeof aviso) => typeof aviso) => setAvisos((x) => ({ ...x, [clave]: f(x[clave] ?? { recien: false, listo: [] }) }));

  const elegir = (equipo: ClaveDeEquipo | null) => {
    if (equipo === actual) return;
    const area = equipo ? areaQueSuma(equipo, exp.estado.areas, escala.areas) : null;
    const nombreDelArea = area ? escala.areas.find((a) => a.id === area)?.nombre : null;
    const extra = (): Operacion[] => (area ? [{ op: "areas", areas: [...exp.estado.areas, area] }] : []);
    void editar((s) => (equipo ? { ...s, equipo } : sinEquipo(s)), extra, {
      exito: equipo
        ? `La guía de esta sesión es la de ${EQUIPOS[equipo].nombre}${nombreDelArea ? `, y ${nombreDelArea} quedó en las áreas en juego` : ""}.`
        : "La guía de esta sesión vuelve a ser la de la empresa entera.",
    }).then((id) => {
      if (id) conAviso(id, () => ({ recien: true, listo: [] }));
    });
  };

  const info = (
    <button
      type="button"
      title={queCambia(marco.clave === "cs")}
      aria-label={queCambia(marco.clave === "cs")}
      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line text-[11px] font-semibold text-fg-muted hover:border-brand hover:text-brand"
    >
      i
    </button>
  );

  if (!puedeEditar) {
    return (
      <p data-recorrido="preventa.sesion.equipo" className="flex items-center gap-1.5 text-[13px] text-fg-muted">
        Equipo del cliente: <span className="text-fg-secondary">{actual ? EQUIPOS[actual].nombre : "la empresa entera"}</span>
        {info}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div data-recorrido="preventa.sesion.equipo" className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          Equipo del cliente:
          {info}
        </span>
        <Menu
          aria-label="Elegir el equipo del cliente de esta sesión"
          panelWidth="w-[320px]"
          triggerClassName={cn(
            "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50",
            actual ? "border-info-line bg-info-surface text-brand hover:bg-surface-hover" : "border-dashed border-line text-fg-secondary hover:bg-surface-hover hover:text-fg",
          )}
          trigger={(abierto) => (
            <>
              {actual ? EQUIPOS[actual].nombre : "La empresa entera"}
              <svg className={cn("h-3 w-3 transition-transform", abierto && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </>
          )}
          items={[
            ...EQUIPOS_DEL_CLIENTE.map((e) => ({
              key: e,
              disabled: guardando,
              label: (
                <span className="flex flex-col gap-0.5">
                  <span className={cn("text-[13px] font-semibold", e === actual ? "text-brand" : "text-fg")}>
                    {e === actual ? "✓ " : ""}
                    {EQUIPOS[e].nombre}
                    {e === sugerido?.equipo ? <span className="ml-1.5 text-[11px] font-medium text-brand">sugerido</span> : null}
                  </span>
                  <span className="text-[11.5px] leading-[15px] text-fg-muted">{EQUIPOS[e].quienes}</span>
                </span>
              ),
              onSelect: () => elegir(e),
            })),
            {
              key: "empresa",
              separatorBefore: true,
              disabled: guardando || !actual,
              label: (
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-fg">La empresa entera</span>
                  <span className="text-[11.5px] leading-[15px] text-fg-muted">La guía de siempre: la meta, los dolores, para cuándo y con qué.</span>
                </span>
              ),
              onSelect: () => elegir(null),
            },
          ]}
        />
        {sugerido && (
          <span className="inline-flex flex-wrap items-center gap-2 rounded-full border border-info-line bg-info-surface py-0.5 pl-2.5 pr-1 text-[12.5px] text-fg-secondary">
            <IconoDeSugerencia className="h-3 w-3 text-brand" />
            <span>
              ¿Es con <span className="font-semibold text-fg">{EQUIPOS[sugerido.equipo].nombre}</span>?{" "}
              <span className="text-fg-muted" title={`«${sugerido.texto}»`}>
                {DE_DONDE_SALE_EL_EQUIPO[sugerido.de]}
              </span>
            </span>
            <BotonAzul disabled={guardando} className="rounded-full px-2.5 py-0.5" onClick={() => elegir(sugerido.equipo)}>
              Usar
            </BotonAzul>
          </span>
        )}
      </div>
      {!aviso.cerrado && (
        <AlCambiarElEquipo
          pestana={pestana}
          recienCambiado={aviso.recien}
          listo={aviso.listo}
          alHacer={(q) => conAviso(pestana.clave, (a) => ({ ...a, listo: [...a.listo, q] }))}
          alCerrar={() => conAviso(pestana.clave, (a) => ({ ...a, cerrado: true }))}
        />
      )}
    </div>
  );
}

/**
 * Lo que conviene rehacer con el equipo nuevo (K11): la guía, la lectura de la reunión y el análisis de la venta, cada
 * uno con su botón de siempre. La lectura se ofrece también después (sabe con qué equipo se leyó); la guía y el análisis,
 * justo al cambiar.
 */
function AlCambiarElEquipo({
  pestana,
  recienCambiado,
  listo,
  alHacer,
  alCerrar,
}: {
  pestana: PestanaDeSesion;
  recienCambiado: boolean;
  listo: readonly QueRehacer[];
  alHacer: (q: QueRehacer) => void;
  alCerrar: () => void;
}) {
  const { exp, marco, veAnalisisDeVenta } = useLienzo();
  const { claveDeLaProxima, estadoDe, yaEmpezo } = useSesiones();
  const { corriendo, lanzando, lanzar } = useCorrida();
  const toast = useToast();
  const [analizando, setAnalizando] = useState(false);
  const s = pestana.sesion;
  const r = pestana.reunion;
  const equipo = s?.equipo ?? null;
  const conAnalisis = !!veAnalisisDeVenta && marco.clave !== "cs" && recienCambiado && r?.origen === "meet";
  const analisis = useAnalisisDeLaVenta(exp.id, conAnalisis);
  if (!s) return null;

  const esLaProxima = pestana.clave === claveDeLaProxima;
  const porPreparar = esLaProxima && estadoDe(pestana) !== "ocurrio" && !yaEmpezo(pestana);
  const guia = exp.estado.propuesta.guias[s.id] ?? (esLaProxima ? exp.estado.propuesta.guia : null);
  const releible = !!r && r.leida && (r.origen === "meet" || r.origen === "hubspot");
  const lectura = releible ? (exp.estado.propuesta.lecturas[claveDeLaReunion(r)] ?? null) : null;
  const vista = conAnalisis ? (analisis.datos?.reuniones.find((x) => x.id === r!.id) ?? null) : null;
  const estado = { equipo, recienCambiado, porPreparar, guia, lectura, analisis: !!vista?.analisis && vista.texto === "transcripcion" };
  const rehacer = queRehacerAlCambiarElEquipo(estado).filter((q) => !listo.includes(q));
  if (!rehacer.length) return null;

  const ocupado = corriendo || lanzando;
  // El botón se va solo cuando la acción arrancó: si el agente ya corría o el pedido falló, sigue ahí.
  const hacer = (q: QueRehacer) => {
    if (q === "guia") void lanzar("guia").then((ok) => ok && alHacer(q));
    else if (q === "lectura" && r) void lanzar("leer", r.origen === "meet" ? { sesionId: r.id } : { hubspotId: r.id }).then((ok) => ok && alHacer(q));
    else if (q === "analisis" && vista) {
      setAnalizando(true);
      void analisis
        .analizar(vista.id)
        .then((x) => {
          alHacer(q);
          toast.success(`Listo: el análisis de la sesión se rehízo con ${x.juicios} juicios con su cita.`);
        })
        .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "No se pudo rehacer el análisis."))
        .finally(() => setAnalizando(false));
    }
  };
  const ETIQUETA: Record<QueRehacer, string> = {
    guia: "Actualizar la guía",
    lectura: "Volver a leer con este equipo",
    analisis: "Volver a analizar la sesión",
  };

  return (
    <section role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-info-line bg-info-surface px-3 py-2">
      <p className="flex min-w-0 flex-[1_1_320px] items-start gap-1.5 text-[12.5px] leading-[1.45] text-fg-secondary">
        <IconoDeSugerencia className="mt-0.5 h-3 w-3 flex-none text-brand" />
        {fraseAlCambiarElEquipo(estado, rehacer)}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {rehacer.map((q, i) =>
          i === 0 ? (
            <BotonAzul key={q} disabled={ocupado || analizando} onClick={() => hacer(q)}>
              {ETIQUETA[q]}
            </BotonAzul>
          ) : (
            <BotonBlanco key={q} disabled={ocupado || analizando} onClick={() => hacer(q)}>
              {ETIQUETA[q]}
            </BotonBlanco>
          ),
        )}
        <BotonTexto onClick={alCerrar}>Ahora no</BotonTexto>
      </div>
    </section>
  );
}
