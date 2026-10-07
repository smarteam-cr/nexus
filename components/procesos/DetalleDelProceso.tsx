"use client";

/**
 * components/procesos/DetalleDelProceso.tsx — UN PROCESO: CÓMO SE HACE HOY Y CÓMO QUEDA DESPUÉS.
 *
 * Arriba, lo del agente y una sola vez (la franja azul mientras el mapa es su borrador); después el
 * mapa en carriles (Hoy · Después de la implementación · Comparar), qué cambia para el cliente y lo
 * que se va de hoy. Al panel de la derecha van las preguntas que faltan y de qué reuniones sale.
 *
 * Acá el mapa se mira. Se cambia en pantalla completa (`EditorDelMapa`): «Editar el mapa», el botón
 * de pantalla completa del mapa o «Editar el paso» en el detalle de un paso.
 */
import { createPortal } from "react-dom";
import { useCallback, useState } from "react";
import { ConfirmDialog, Segmentado } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, FranjaDeSugerencias, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { cuentasDelMapa, ETIQUETA_DE_AREA, type EstadoDelMapa, type MapaDeProceso } from "@/lib/procesos/mapa";
import { pedirPantallaCompletaDelNavegador } from "@/components/ui/PantallaCompleta";
import EditorDelMapa, { type MapaGuardado } from "./EditorDelMapa";
import MapaPorCarriles, { fechaCorta, IconoPantallaCompleta, type CualVersion, type VistaDelMapa } from "./MapaPorCarriles";
import { ChipDeEstado } from "./ChipDeEstado";

const VISTAS = [
  { clave: "hoy" as const, etiqueta: "Hoy" },
  { clave: "despues" as const, etiqueta: "Después de la implementación" },
  { clave: "comparar" as const, etiqueta: "Comparar" },
];

/** Las reuniones de donde salen las citas del mapa, con cuántas citas aporta cada una. */
function reunionesDelMapa(m: MapaDeProceso) {
  const porId = new Map<string, { titulo: string; fecha: string; citas: number }>();
  for (const p of [...m.hoy.pasos, ...m.despues.pasos]) {
    for (const c of p.citas) {
      const r = porId.get(c.sesionId) ?? { titulo: c.sesionTitulo, fecha: c.fecha, citas: 0 };
      r.citas += 1;
      porId.set(c.sesionId, r);
    }
  }
  return [...porId.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function Leyenda({ vista }: { vista: VistaDelMapa }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-4 rounded-[3px] border border-line bg-surface" /> con cita del cliente
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-4 rounded-[3px] border-[1.5px] border-dashed border-warning bg-surface" /> supuesto
      </span>
      {vista !== "despues" && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-[3px] border border-warn-line bg-warn-surface" /> dolor
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-4 rounded-[3px] border border-line bg-surface-hover" /> carril de un sistema
      </span>
      {vista === "comparar" && (
        <span className="inline-flex items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-fg text-[9px] font-bold text-surface">1</span> el cambio de abajo
        </span>
      )}
    </div>
  );
}

export default function DetalleDelProceso({
  clientId,
  blockId,
  mapa,
  editadoAMano,
  puedeEditar,
  slotDelPanel,
  ocupado,
  onVolver,
  onEstado,
  onGuardado,
  onQuitar,
}: {
  clientId: string;
  blockId: string;
  mapa: MapaDeProceso;
  editadoAMano: boolean;
  puedeEditar: boolean;
  slotDelPanel: HTMLElement | null;
  /** Mientras se guarda un cambio del mapa. */
  ocupado: boolean;
  onVolver: () => void;
  onEstado: (estado: EstadoDelMapa) => void;
  /** Lo que se guardó en el editor de pantalla completa. */
  onGuardado: (r: MapaGuardado) => void;
  onQuitar: () => void;
}) {
  const [vista, setVista] = useState<VistaDelMapa>("hoy");
  const [editor, setEditor] = useState<{ cual: CualVersion; pasoId?: string } | null>(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  // Se llama en el clic: el navegador solo da pantalla completa a un gesto de la persona.
  const abrirEditor = useCallback((cual: CualVersion, pasoId?: string) => {
    pedirPantallaCompletaDelNavegador();
    setEditor({ cual, pasoId });
  }, []);

  const c = cuentasDelMapa(mapa);
  const total = mapa.hoy.pasos.length + mapa.despues.pasos.length;
  const reuniones = reunionesDelMapa(mapa);
  const hoyPorId = new Map(mapa.hoy.pasos.map((p) => [p.id, p]));
  const citas = reuniones.reduce((s, r) => s + r.citas, 0);

  return (
    <div className="space-y-5">
      {slotDelPanel &&
        createPortal(
          <div className="flex flex-col gap-5">
            {mapa.estado === "borrador" && (
              <QueSigue>
                Revisa el mapa con calma: {c.supuestos + c.propuestos} de {total} pasos no los dijo el cliente. Lo que falte, llévalo a la próxima sesión.
              </QueSigue>
            )}
            {mapa.estado === "revisado" && (
              <QueSigue>Muéstraselo al cliente y márcalo como validado: recién ahí entra a la sección «Procesos» del kickoff.</QueSigue>
            )}
            {mapa.preguntas.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <span className={ROTULO_DEL_SISTEMA}>Falta confirmar con el cliente</span>
                <ul className="flex flex-col gap-2">
                  {mapa.preguntas.map((q, i) => (
                    <li key={i} className="rounded-xl border border-warn-line bg-warn-surface px-3 py-2.5 text-[13px] leading-relaxed text-warn-ink">
                      {q}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="flex flex-col gap-2.5">
              <span className={ROTULO_DEL_SISTEMA}>De dónde sale este mapa</span>
              {reuniones.length === 0 ? (
                <p className="text-[13px] text-fg-muted">Ningún paso trae cita: todo lo completó el agente.</p>
              ) : (
                <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
                  {reuniones.map((r, i) => (
                    <li key={i} className={cn("flex items-start justify-between gap-3 px-3 py-2", i > 0 && "border-t border-line")}>
                      <span className="min-w-0 text-[13px] leading-snug text-fg">
                        {r.titulo} <span className="text-fg-muted">· {fechaCorta(r.fecha)}</span>
                      </span>
                      <span className="flex-shrink-0 text-xs tabular-nums text-fg-muted">{r.citas === 1 ? "1 cita" : `${r.citas} citas`}</span>
                    </li>
                  ))}
                </ul>
              )}
              {citas > 0 && (
                <p className="text-xs leading-relaxed text-fg-muted">
                  Las {citas} citas se buscaron en la transcripción de su reunión: si una no aparecía tal cual, el paso quedó como supuesto.
                </p>
              )}
            </section>
          </div>,
          slotDelPanel,
        )}

      <div className="space-y-2">
        <button type="button" onClick={onVolver} className="text-[13px] text-brand transition-colors hover:text-brand-light">
          ← Procesos
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[22px] font-bold leading-tight text-fg">{mapa.nombre}</h2>
              <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-fg-secondary">{ETIQUETA_DE_AREA[mapa.area]}</span>
              <ChipDeEstado estado={mapa.estado} />
              {editadoAMano && <span className="text-[11px] text-fg-muted">editado a mano</span>}
            </div>
            {mapa.queResuelve && <p className="max-w-3xl text-[13px] leading-relaxed text-fg-secondary">{mapa.queResuelve}</p>}
          </div>
          {puedeEditar && (
            <div className="flex flex-shrink-0 items-center gap-2">
              {mapa.estado === "revisado" && (
                <>
                  <BotonTexto onClick={() => onEstado("borrador")} disabled={ocupado}>
                    Volver a borrador
                  </BotonTexto>
                  <BotonBlanco onClick={() => onEstado("validado")} disabled={ocupado}>
                    Validado con el cliente
                  </BotonBlanco>
                </>
              )}
              {mapa.estado === "validado" && (
                <BotonTexto onClick={() => onEstado("revisado")} disabled={ocupado} title="Sale de la sección «Procesos» del kickoff">
                  Quitar la validación
                </BotonTexto>
              )}
              <BotonTexto onClick={() => setConfirmarQuitar(true)} disabled={ocupado}>
                Quitar el mapa
              </BotonTexto>
            </div>
          )}
        </div>
        {mapa.estado === "validado" && mapa.validadoPor && (
          <p className="text-xs text-fg-muted">
            Validado por {mapa.validadoPor}
            {mapa.validadoEn ? ` el ${fechaCorta(mapa.validadoEn.slice(0, 10))}` : ""}. Es el que muestra el kickoff.
          </p>
        )}
      </div>

      {mapa.estado === "borrador" && (
        <FranjaDeSugerencias
          acciones={
            puedeEditar ? (
              <BotonAzul onClick={() => onEstado("revisado")} disabled={ocupado}>
                Marcar como revisado
              </BotonAzul>
            ) : undefined
          }
        >
          Borrador del agente: {c.conCita} de {total} pasos los dijo o acordó el cliente, con su cita
          {c.supuestos ? ` · ${c.supuestos} supuestos` : ""}
          {c.propuestos ? ` · ${c.propuestos} propuestos por Smarteam` : ""}. Nada se valida solo.
        </FranjaDeSugerencias>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmentado opciones={VISTAS} valor={vista} onCambio={setVista} etiqueta="Qué versión del proceso ver" />
          <BotonBlanco onClick={() => abrirEditor(vista === "despues" ? "despues" : "hoy")} disabled={ocupado} className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5" aria-hidden="true">
              <IconoPantallaCompleta />
            </span>
            {puedeEditar ? "Editar el mapa" : "Ver en pantalla completa"}
          </BotonBlanco>
        </div>
        <Leyenda vista={vista} />
      </div>

      <MapaPorCarriles mapa={mapa} vista={vista} onAbrirEditor={abrirEditor} puedeEditar={puedeEditar} />

      {mapa.cambios.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-fg">Qué cambia para el cliente</h3>
          <ol className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
            {mapa.cambios.map((cambio, i) => (
              <li key={i} className={cn("flex items-start gap-3 px-4 py-3", i > 0 && "border-t border-line")}>
                <span className="mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-fg text-[10.5px] font-bold text-surface">
                  {i + 1}
                </span>
                <span className="text-[13.5px] leading-relaxed text-fg">{cambio.texto}</span>
              </li>
            ))}
          </ol>
          {vista !== "comparar" && (
            <BotonTexto onClick={() => setVista("comparar")} className="px-0 text-brand hover:text-brand-light">
              Ver los cambios marcados en los dos mapas →
            </BotonTexto>
          )}
        </section>
      )}

      {mapa.despues.seVa.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-fg">Lo que se va de hoy</h3>
          <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
            {mapa.despues.seVa.map((v, i) => (
              <li key={v.id} className={cn("space-y-0.5 px-4 py-3", i > 0 && "border-t border-line")}>
                <p className="text-[13.5px] text-fg line-through decoration-fg-muted">{hoyPorId.get(v.id)?.texto ?? v.id}</p>
                <p className="text-[13px] leading-relaxed text-fg-secondary">{v.porque}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-fg-muted">
        Lo armó el agente el {fechaCorta(mapa.generadoEn.slice(0, 10))} con las reuniones del cliente. Toca un paso para ver de dónde sale
        {puedeEditar ? "; para cambiar el mapa, ábrelo en pantalla completa." : "."}
      </p>

      {editor && (
        <EditorDelMapa
          clientId={clientId}
          blockId={blockId}
          mapa={mapa}
          inicial={editor}
          soloLectura={!puedeEditar}
          onCerrar={() => setEditor(null)}
          onGuardado={(r) => {
            setEditor(null);
            onGuardado(r);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmarQuitar}
        title="¿Quitar este mapa?"
        description={`Se borra «${mapa.nombre}» de los procesos del cliente. Si vuelves a mapear, el agente puede armarlo de nuevo.`}
        confirmLabel="Quitar"
        variant="destructive"
        onCancel={() => setConfirmarQuitar(false)}
        onConfirm={() => {
          setConfirmarQuitar(false);
          onQuitar();
        }}
      />
    </div>
  );
}
