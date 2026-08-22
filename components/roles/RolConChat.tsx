"use client";

/**
 * RolConChat — el chat del asistente sobre un documento de Roles.
 *
 * Mismo motivo que `PropuestaConChat`: el proveedor del aplicador tiene que ser ANCESTRO del
 * editor (el que provee no consume) y la página es de servidor, así que no puede pasarle la
 * función que abre el cajón.
 *
 * ⚠ UN SOLO slug de pieza para los dos tipos de documento: el tipo es una columna de la fila, no
 * otro documento. Ver `PIEZA_ROL`.
 */
import { useCallback, useState } from "react";
import { AplicadorDeDocumentoProvider } from "@/components/asistente/aplicador-de-documento";
import ChatDelDocumento from "@/components/asistente/ChatDelDocumento";
import { PIEZA_ROL } from "@/lib/asistente/piezas";
import RoleWorkspace from "./RoleWorkspace";

type PropsDelWorkspace = Omit<Parameters<typeof RoleWorkspace>[0], "onAbrirChat">;

export default function RolConChat(props: PropsDelWorkspace) {
  const [abierto, setAbierto] = useState(false);
  const abrir = useCallback(() => setAbierto(true), []);

  return (
    <AplicadorDeDocumentoProvider>
      <RoleWorkspace {...props} onAbrirChat={abrir} />
      <ChatDelDocumento
        base={`/api/roles/${props.role.id}`}
        pieza={PIEZA_ROL}
        piezaLabel={props.role.docType === "PROPUESTA" ? "Propuesta" : "Perfil de puesto"}
        abierto={abierto}
        onClose={() => setAbierto(false)}
      />
    </AplicadorDeDocumentoProvider>
  );
}
