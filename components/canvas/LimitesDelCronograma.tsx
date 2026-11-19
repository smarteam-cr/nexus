"use client";

/**
 * components/canvas/LimitesDelCronograma.tsx — LO ACORDADO CON EL CLIENTE, arriba del Gantt (2026-10-02).
 *
 * La fecha límite, la duración vendida (sin la Semana 0) y las horas vendidas (2026-11-18), quién las confirmó, lo que propuso la IA y,
 * si el plan no cabe, el aviso con cuánto se pasa y qué fases quedan después. La regla y los textos
 * viven en lib/timeline/limites.ts; esto solo los muestra y manda los cambios a
 * PATCH /api/projects/[projectId]/timeline/limites.
 *
 * Decisiones de Elías (2026-10-02): pasarse AVISA, no frena nada; confirma Ventas y, si no, el CSL o el
 * CSE (cualquiera que pueda editar el cronograma), y queda escrito quién; mover un límite ya confirmado
 * es un acuerdo con el cliente: pide con quién y por qué.
 */
import { useMemo, useState } from "react";
import { Alert, Button, Field, Input, Modal, Textarea } from "@/components/ui";
import DatePickerField from "@/components/ui/DatePickerField";
import { useToast } from "@/components/ui/Toast";
import { ROLE_LABEL } from "@/components/team/roles-ui";
import {
  MAX_HORAS_VENDIDAS,
  MAX_SEMANAS_VENDIDAS,
  estadoDeLaFila,
  fmtYmd,
  pasaUnLimiteConfirmado,
  problemasDeLimites,
  revisarLimites,
  textoDeLoVendido,
  type CampoDeLimite,
  type ConfirmacionDeLimite,
  type LimitesDelCronograma,
  type PropuestaDeLimite,
} from "@/lib/timeline/limites";

interface Props {
  projectId: string;
  limites: LimitesDelCronograma | null;
  /** yyyy-mm-dd o "". */
  ancla: string;
  fases: ReadonlyArray<{
    name: string;
    durationWeeks: number;
    startWeek?: number | null;
    tasks?: ReadonlyArray<{ horasEstimadas?: number | null; status?: string | null; party?: string | null }>;
  }>;
  canEdit: boolean;
  onCambio: (l: LimitesDelCronograma) => void;
  /**
   * 2026-11-18: «Ajustar el plan a lo vendido» (desde el 2026-11-19, «Acortar el plan»). Corre el paso 1 de «Regenerar todo» con el pedido de que el plan entre
   * en lo vendido (puede juntar fases sin empezar): termina en la misma propuesta, que el CSE revisa. Sin esto (sin
   * permiso de IA), el botón no aparece.
   */
  onAjustarALoVendido?: () => void;
  ajustando?: boolean;
}

const NOMBRE: Record<CampoDeLimite, string> = {
  fechaLimite: "Fecha límite",
  duracionVendida: "Duración vendida",
  horasVendidas: "Horas vendidas",
};

const confirmadoDe = (l: LimitesDelCronograma, campo: CampoDeLimite): string | number | null =>
  campo === "fechaLimite" ? l.fechaLimite : campo === "horasVendidas" ? l.horasVendidas : l.duracionVendidaSemanas;

function quien(c: ConfirmacionDeLimite | undefined): string | null {
  if (!c) return null;
  const rol = c.rol ? (ROLE_LABEL[c.rol] ?? c.rol) : null;
  return `${c.nombre ?? c.por}${rol ? ` (${rol})` : ""}`;
}

type Edicion = { campo: CampoDeLimite; valorInicial: string };

export default function LimitesDelCronograma({ projectId, limites, ancla, fases, canEdit, onCambio, onAjustarALoVendido, ajustando }: Props) {
  const toast = useToast();
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [enviando, setEnviando] = useState(false);

  const revision = useMemo(
    () => (limites ? revisarLimites({ ancla: ancla || null, fases, limites }) : null),
    [limites, ancla, fases],
  );
  if (!limites || !revision) return null;
  /* 2026-11-19 (Elías, al ver RC en producción): el aviso aparece SOLO si algo de verdad se pasa, con el problema concreto
     como título; lo que entra se marca en su fila. Nunca «cabe» y «no cabe» en el mismo recuadro. */
  const problemas = problemasDeLimites(revision, limites.conSemanaCero);
  // Solo con un límite CONFIRMADO que el plan pasa (decisión de Elías: juntar fases pide una duración confirmada).
  const puedeAcortar = !!onAjustarALoVendido && pasaUnLimiteConfirmado(revision);
  const paraAcortar = problemas.find((x) => x.origen === "confirmado") ?? null;

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setEnviando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/limites`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.limites) {
        toast.error(data?.error ?? "No se pudo guardar el límite.");
        return false;
      }
      onCambio(data.limites as LimitesDelCronograma);
      return true;
    } finally {
      setEnviando(false);
    }
  }

  const confirmarPropuesta = (campo: CampoDeLimite, valor: string | number) =>
    void patch({ accion: "guardar", campo, valor, desdeLaPropuesta: true }).then((ok) => ok && toast.success(`${NOMBRE[campo]} ${campo === "horasVendidas" ? "confirmadas" : "confirmada"}.`));
  const descartarPropuesta = (campo: CampoDeLimite) => void patch({ accion: "descartar-propuesta", campo });

  const fila = (campo: CampoDeLimite) => {
    const confirmado = confirmadoDe(limites, campo);
    const propuesta = limites.propuestos?.[campo] as PropuestaDeLimite<string | number> | undefined;
    const texto = (v: string | number) =>
      campo === "fechaLimite"
        ? fmtYmd(String(v))
        : campo === "horasVendidas"
          ? `${v} ${Number(v) === 1 ? "hora" : "horas"}`
          : textoDeLoVendido(Number(v), limites.conSemanaCero);
    const conf = limites.confirmacion[campo];
    const estado = confirmado !== null ? estadoDeLaFila(revision, campo) : null;
    return (
      <div key={campo} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-semibold text-fg-secondary">{NOMBRE[campo]}:</span>
        {confirmado !== null ? (
          <>
            <span className="rounded-md border border-line bg-surface-hover px-2 py-0.5 font-semibold text-fg">{texto(confirmado)}</span>
            {estado && (
              <span
                className={
                  estado.entra === null ? "text-fg-muted" : estado.entra ? "font-semibold text-success-ink" : "font-semibold text-warn-ink"
                }
              >
                {estado.entra ? "✓ " : ""}
                {estado.texto}
              </span>
            )}
            {conf && <span className="text-fg-muted">confirmada por {quien(conf)}</span>}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEdicion({ campo, valorInicial: String(confirmado) })}
                className="font-semibold text-info-ink underline underline-offset-2 hover:opacity-80"
              >
                Mover
              </button>
            )}
          </>
        ) : !propuesta ? (
          <>
            <span className="text-fg-muted">sin dato</span>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEdicion({ campo, valorInicial: "" })}
                className="font-semibold text-info-ink underline underline-offset-2 hover:opacity-80"
              >
                Agregar
              </button>
            )}
          </>
        ) : null}
        {/* Lo que propuso la IA (si difiere de lo confirmado): con su cita, para confirmar o descartar. */}
        {propuesta && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-md border border-info-line bg-info-surface px-2 py-0.5 text-info-ink">
              La IA leyó: <strong>{texto(propuesta.valor)}</strong>
            </span>
            <span className="max-w-[42ch] truncate text-fg-muted" title={propuesta.cita}>
              «{propuesta.cita}»{propuesta.citaVerificada ? "" : " · no la encontré tal cual en las fuentes"}
            </span>
            {canEdit && (
              <>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() =>
                    confirmado !== null
                      ? setEdicion({ campo, valorInicial: String(propuesta.valor) })
                      : confirmarPropuesta(campo, propuesta.valor)
                  }
                  className="font-semibold text-info-ink underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
                >
                  {confirmado !== null ? "Usar este" : "Confirmar"}
                </button>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => descartarPropuesta(campo)}
                  className="text-fg-muted hover:text-fg-secondary disabled:opacity-50"
                >
                  Descartar
                </button>
              </>
            )}
          </span>
        )}
      </div>
    );
  };

  return (
    <section data-recorrido="cronograma.limites" aria-label="Lo acordado con el cliente" className="space-y-2 rounded-xl border border-line bg-surface px-4 py-3">
      <h2 className="text-sm font-semibold text-fg">Lo acordado con el cliente</h2>
      <div className="space-y-1.5">
        {fila("duracionVendida")}
        {fila("horasVendidas")}
        {fila("fechaLimite")}
      </div>
      {problemas.length > 0 && (
        <Alert variant="warning" title={problemas[0].titulo}>
          <div className="space-y-2">
            {problemas.map((x, k) => (
              <div key={x.campo}>
                {k > 0 && <p className="font-semibold">{x.titulo}</p>}
                <p>{x.contexto}</p>
              </div>
            ))}
            {canEdit && (puedeAcortar || problemas.some((x) => x.origen === "confirmado")) && (
              <div className="space-y-1.5 pt-1">
                {puedeAcortar && paraAcortar && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Button size="xs" variant="primary" disabled={ajustando} onClick={onAjustarALoVendido}>
                      {ajustando ? "Acortando…" : "Acortar el plan"}
                    </Button>
                    <span className="text-xs">
                      {paraAcortar.campo === "fechaLimite"
                        ? `La IA propone cómo cerrar ${paraAcortar.loAcordado}; lo revisas antes de aplicarlo.`
                        : `La IA propone cómo entrar en ${paraAcortar.loAcordado}; lo revisas antes de aplicarlo.`}
                    </span>
                  </div>
                )}
                {problemas
                  .filter((x) => x.origen === "confirmado")
                  .map((x) => (
                    <div key={x.campo} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {/* Abre con lo que haría entrar el plan, nunca con lo que ya está (2026-11-18: guardarlo daba «Ese ya es
                          el valor confirmado»). */}
                      <Button size="xs" variant="secondary" onClick={() => setEdicion({ campo: x.campo, valorInicial: String(x.valorQueEntra) })}>
                        {x.campo === "fechaLimite" ? `Cambiar la fecha ${x.textoDelValor}` : `Cambiar ${x.textoDelValor}`}
                      </Button>
                      <span className="text-xs">Solo si ya lo acordaste con el cliente.</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </Alert>
      )}
      {edicion && (
        <EditarLimite
          edicion={edicion}
          confirmado={confirmadoDe(limites, edicion.campo)}
          conSemanaCero={limites.conSemanaCero}
          enviando={enviando}
          onCerrar={() => setEdicion(null)}
          onGuardar={async (body) => {
            const ok = await patch({ accion: "guardar", campo: edicion.campo, ...body });
            if (ok) {
              setEdicion(null);
              toast.success(body.valor === null ? `${NOMBRE[edicion.campo]}: se quitó.` : `${NOMBRE[edicion.campo]} ${edicion.campo === "horasVendidas" ? "guardadas" : "guardada"}.`);
            }
          }}
        />
      )}
    </section>
  );
}

function EditarLimite({
  edicion,
  confirmado,
  conSemanaCero,
  enviando,
  onCerrar,
  onGuardar,
}: {
  edicion: Edicion;
  confirmado: string | number | null;
  conSemanaCero: boolean;
  enviando: boolean;
  onCerrar: () => void;
  onGuardar: (b: { valor: string | number | null; motivo: string | null; acordadoCon: string | null }) => void;
}) {
  const esFecha = edicion.campo === "fechaLimite";
  const esHoras = edicion.campo === "horasVendidas";
  const tope = esHoras ? MAX_HORAS_VENDIDAS : MAX_SEMANAS_VENDIDAS;
  const [valor, setValor] = useState(edicion.valorInicial);
  const [motivo, setMotivo] = useState("");
  const [acordadoCon, setAcordadoCon] = useState("");
  const mueve = confirmado !== null;
  const titulo = mueve ? `Mover la ${NOMBRE[edicion.campo].toLowerCase()}` : `${NOMBRE[edicion.campo]}`;
  const valorEnviable = (v: string): string | number | null => (v.trim() === "" ? null : esFecha ? v : Number(v));
  const v = valorEnviable(valor);
  const valido = v === null ? mueve : esFecha ? /^\d{4}-\d{2}-\d{2}$/.test(String(v)) : Number.isInteger(v) && Number(v) >= 1 && Number(v) <= tope;
  const faltaAcuerdo = mueve && (motivo.trim().length < 3 || acordadoCon.trim().length < 3);

  return (
    <Modal
      open
      onClose={onCerrar}
      title={titulo}
      description={
        mueve
          ? "Moverlo es un acuerdo con el cliente: queda en el historial del cronograma con quién y por qué."
          : esFecha
            ? "El día en que el cliente necesita todo listo (vence una licencia, un lanzamiento)."
            : esHoras
              ? "Las horas vendidas para este proyecto. Si sale de un contrato de horas, las que le tocan a él (no las del contrato entero)."
              : `Las semanas que se vendieron${conSemanaCero ? ", sin contar la Semana 0" : ""}.`
      }
      footer={
        <>
          {mueve && (
            <Button
              variant="secondary"
              size="sm"
              disabled={enviando || faltaAcuerdo}
              onClick={() => onGuardar({ valor: null, motivo: motivo.trim(), acordadoCon: acordadoCon.trim() })}
            >
              Quitar
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={enviando || !valido || v === null || faltaAcuerdo}
            onClick={() => onGuardar({ valor: v, motivo: motivo.trim() || null, acordadoCon: acordadoCon.trim() || null })}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {esFecha ? (
          <Field label="Fecha límite" required>
            <DatePickerField value={valor} onChange={setValor} placeholder="Elegir fecha" />
          </Field>
        ) : (
          <Field label={esHoras ? "Horas vendidas" : `Semanas vendidas${conSemanaCero ? " (sin la Semana 0)" : ""}`} required>
            <Input type="number" min={1} max={tope} value={valor} onChange={(e) => setValor(e.target.value)} />
          </Field>
        )}
        {mueve ? (
          <>
            <Field label="Con quién del cliente se acordó" required>
              <Input value={acordadoCon} onChange={(e) => setAcordadoCon(e.target.value)} placeholder="Nombre y cargo" />
            </Field>
            <Field label="Motivo" required>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Qué cambió y por qué" />
            </Field>
          </>
        ) : (
          <Field label="De dónde sale" hint="Ej.: lo dijo el cliente en el kickoff del 23 de septiembre.">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
