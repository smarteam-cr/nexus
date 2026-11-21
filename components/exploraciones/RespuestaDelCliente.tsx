"use client";

/**
 * RespuestaDelCliente — en el «Acceso» de La escala: CUÁNDO se le presentó al cliente y QUÉ RESPONDIÓ (Elías, 21 nov).
 *
 * La fecha de la presentación y la respuesta (aceptó, aceptó con cambios o pidió ajustes, con su nota) se guardan con
 * quién y cuándo, sin pisar lo anterior (lib/exploraciones/hitos-de-la-escala-server.ts). Lo aceptado pasa a ser el
 * contexto de más peso: el agente de impacto lo compara con cada nota nueva y el handoff lo lee.
 * Datos: /api/sales/exploraciones/[id]/acceso/respuesta. Solo con algo publicado: se presenta lo que ve el cliente.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Field, Input, Segmentado, Textarea } from "@/components/ui";
import { BotonBlanco, BotonEnlace } from "@/components/ui/sistema";
import { diaConAnio } from "@/lib/exploraciones/fechas";
import { ETIQUETA_DE_LA_RESPUESTA, hoyEnCostaRica, MAX_NOTA_DE_LA_RESPUESTA, type EstadoConElCliente, type RespuestaDelCliente as Respuesta } from "@/lib/impacto/respuesta-del-cliente";

const quien = (correo: string | null) => (correo ? ` (lo anotó ${correo.split("@")[0]})` : "");

const OPCIONES: { clave: Respuesta; etiqueta: string }[] = [
  { clave: "acepto", etiqueta: ETIQUETA_DE_LA_RESPUESTA.acepto },
  { clave: "acepto-con-cambios", etiqueta: ETIQUETA_DE_LA_RESPUESTA["acepto-con-cambios"] },
  { clave: "pidio-ajustes", etiqueta: ETIQUETA_DE_LA_RESPUESTA["pidio-ajustes"] },
];

export default function RespuestaDelCliente({ exploracionId, puedeEditar }: { exploracionId: string; puedeEditar: boolean }) {
  const [estado, setEstado] = useState<EstadoConElCliente | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [fecha, setFecha] = useState(() => hoyEnCostaRica());
  const [otraPresentacion, setOtraPresentacion] = useState(false);
  const [tipo, setTipo] = useState<Respuesta | null>(null);
  const [nota, setNota] = useState("");

  const url = `/api/sales/exploraciones/${exploracionId}/acceso/respuesta`;
  const leer = useCallback(async () => {
    const r = await fetch(url, { cache: "no-store" });
    const j = (await r.json().catch(() => null)) as (EstadoConElCliente & { error?: string }) | null;
    if (!r.ok || !j) throw new Error(j?.error ?? "No se pudo leer la respuesta del cliente.");
    return j;
  }, [url]);

  useEffect(() => {
    let vivo = true;
    leer()
      .then((j) => vivo && setEstado(j))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo leer la respuesta del cliente."));
    return () => {
      vivo = false;
    };
  }, [leer]);

  const anotar = async (cuerpo: Record<string, string>) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const j = (await r.json().catch(() => null)) as (EstadoConElCliente & { error?: string }) | null;
      if (!r.ok || !j) throw new Error(j?.error ?? "No se pudo guardar.");
      setEstado(j);
      setOtraPresentacion(false);
      setTipo(null);
      setNota("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  if (!estado && !error) return null;
  const pideNota = tipo === "acepto-con-cambios" || tipo === "pidio-ajustes";
  const r = estado?.respuesta;

  return (
    <section aria-labelledby="respuesta-del-cliente" className="space-y-2 rounded-lg border border-line px-3 py-2.5">
      <h3 id="respuesta-del-cliente" className="text-xs font-semibold text-fg">
        La presentación y lo que respondió el cliente
      </h3>
      {error && <Alert variant="danger">{error}</Alert>}
      {estado?.presentadaEl && !otraPresentacion ? (
        <p className="text-[13px] text-fg-secondary">
          Se la presentaste el {diaConAnio(estado.presentadaEl)}
          {quien(estado.presentadaPor)}.{" "}
          {puedeEditar && <BotonEnlace onClick={() => setOtraPresentacion(true)}>Anotar otra presentación</BotonEnlace>}
        </p>
      ) : (
        puedeEditar && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="¿Cuándo se la presentaste?">
              <Input type="date" value={fecha} max={hoyEnCostaRica()} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <BotonBlanco disabled={guardando || !fecha} onClick={() => void anotar({ tipo: "presentada", fecha })}>
              Anotar la presentación
            </BotonBlanco>
            {otraPresentacion && <BotonEnlace onClick={() => setOtraPresentacion(false)}>Cancelar</BotonEnlace>}
          </div>
        )
      )}
      {!estado?.presentadaEl && !puedeEditar && <p className="text-[13px] text-fg-muted">Todavía no se anotó cuándo se le presentó.</p>}

      {r && (
        <p className="text-[13px] text-fg">
          {ETIQUETA_DE_LA_RESPUESTA[r.tipo]} el {diaConAnio(r.en)}
          {quien(r.por)}
          {r.nota ? `: «${r.nota}»` : "."}
        </p>
      )}
      {estado?.aceptado && r?.tipo === "pidio-ajustes" && (
        <p className="text-xs text-fg-muted">Lo último que aceptó es del {diaConAnio(estado.aceptado.en)}: sigue siendo lo de más peso hasta que acepte la versión nueva.</p>
      )}

      {estado?.presentadaEl && puedeEditar && !otraPresentacion && (
        <div className="space-y-2">
          <Segmentado opciones={OPCIONES} valor={tipo} onCambio={setTipo} etiqueta={r ? "Cambiar la respuesta del cliente" : "Qué respondió el cliente"} />
          {tipo && (
            <>
              <Field label={pideNota ? (tipo === "pidio-ajustes" ? "¿Qué ajustes pidió?" : "¿Qué cambios pidió?") : "Algo que dijo (opcional)"}>
                <Textarea value={nota} rows={2} maxLength={MAX_NOTA_DE_LA_RESPUESTA} onChange={(e) => setNota(e.target.value)} />
              </Field>
              <div className="flex items-center gap-2">
                <BotonBlanco disabled={guardando || (pideNota && nota.trim().length < 3)} onClick={() => void anotar({ tipo, ...(nota.trim() ? { nota: nota.trim() } : {}) })}>
                  Guardar la respuesta
                </BotonBlanco>
                <BotonEnlace onClick={() => setTipo(null)}>Cancelar</BotonEnlace>
              </div>
              <p className="text-xs text-fg-muted">
                {tipo === "pidio-ajustes"
                  ? "Pedir ajustes no es aceptar: lo que vio queda como presentado."
                  : "Lo que aceptó pasa a ser lo de más peso: si una nota nueva lo contradice, Nexus te avisa."}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
