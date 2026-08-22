"use client";

/**
 * PropuestaConChat — el chat del asistente sobre la propuesta comercial.
 *
 * ── POR QUÉ ES UN ENVOLTORIO Y NO UNA LÍNEA ADENTRO DEL WORKSPACE ───────────────────────────
 * `AplicadorDeDocumentoProvider` es el canal por el que el cajón alcanza al editor. Un contexto
 * solo fluye hacia ABAJO, así que el que provee NO puede consumir: si el workspace montara el
 * proveedor y además registrara su aplicador, leería `null` y el botón «Aplicar» no haría nada —
 * el bug exacto que estuvo vivo en el chat de proyectos hasta el 2026-08-22, sin un solo error en
 * consola. El proveedor tiene que ser ANCESTRO del workspace, y por eso vive acá.
 *
 * Y la página que lo monta es un componente de servidor: no puede pasarle una función al
 * proveedor. Este archivo es el borde donde eso deja de ser un problema.
 */
import { useCallback, useState } from "react";
import { AplicadorDeDocumentoProvider } from "@/components/asistente/aplicador-de-documento";
import { ChatDeSeccionProvider } from "@/components/asistente/chat-de-seccion";
import ChatDelDocumento from "@/components/asistente/ChatDelDocumento";
import { PIEZA_PROPUESTA_COMERCIAL } from "@/lib/asistente/piezas";
import BusinessCaseWorkspace from "./BusinessCaseWorkspace";

type PropsDelWorkspace = Omit<Parameters<typeof BusinessCaseWorkspace>[0], "onAbrirChat">;

export default function PropuestaConChat(props: PropsDelWorkspace) {
  const [abierto, setAbierto] = useState(false);
  /* ⚠ Estable: `ChatDeSeccionProvider` lo mete en un `useMemo` allá adentro, así que una flecha
     inline recrearía el contexto en cada render y re-renderizaría el chrome de cada sección. */
  const abrir = useCallback(() => setAbierto(true), []);

  return (
    <AplicadorDeDocumentoProvider>
      {/* ⛔ El proveedor envuelve el workspace Y el cajón, en ese orden. Mientras vivió ADENTRO del
          workspace, el cajón era su HERMANO y leía el contexto por defecto: el chip nunca se fijaba
          y el modelo no sabía de qué sección se hablaba. Visto en producción el 2026-08-22.
          El workspace declara su disponibilidad desde adentro, con `ChatDeSeccionDisponible`. */}
      <ChatDeSeccionProvider onAbrir={abrir}>
      <BusinessCaseWorkspace {...props} onAbrirChat={abrir} />
      <ChatDelDocumento
        base={`/api/business-cases/${props.bcId}`}
        pieza={PIEZA_PROPUESTA_COMERCIAL}
        piezaLabel="Propuesta comercial"
        abierto={abierto}
        onClose={() => setAbierto(false)}
      />
      </ChatDeSeccionProvider>
    </AplicadorDeDocumentoProvider>
  );
}
