# Resumen liviano: la preventa muestra lo esencial (22 nov)

Pedido de Elías: el Resumen de la preventa y el inicio de la Exploración muestran demasiado. Todo se sigue GUARDANDO
igual en la arquitectura de cada empresa; cambia solo lo que se PRESENTA.

## Lo que estaba a la vista y su destino

### Resumen (`components/exploraciones/Resumen.tsx`)

| # | Pieza de antes | Destino |
|---|---|---|
| 1 | «La exploración»: en qué va (activa, sesión N, la última) | Queda igual |
| 2 | El botón del momento («Analizar / Preparar la sesión N») | Queda igual |
| 3 | «Hallazgos»: los de la última guía o el resumen de cada sesión leída, con su pie | **Sale de la vista.** El resumen de cada sesión sigue en «Lo que aprendimos» de esa sesión. `propuesta.hallazgos` se sigue guardando y la guía lo sigue leyendo |
| 4 | El aviso «La última reunión se puso técnica» | Queda igual |
| 5 | La franja «El agente sugiere…», «Usadas hoy» y «N sugerencias de las sesiones esperan» | Queda igual |
| 6 | Las 10 tarjetas del marco: letra, nombre, «Confirmado / sugeridas / Falta» y TODO lo confirmado en viñetas | Quedan la letra, el nombre y las marcas. Lo confirmado se ve en su **versión compacta** (la arma Haiku). Sin versión compacta vigente: lo de siempre, recortado a 4 líneas con «+N más». Al tocar la tarjeta se abre la casilla con todo, como hoy |
| 7 | Lo sugerido de una tarjeta vacía, en azul | Queda igual |
| 8 | Objeciones (todas, con su editor y lo propuesto) | Queda igual |
| 9 | Particularidades (todas, con su editor y lo propuesto) | A la vista, las **5 más recientes**, la más nueva arriba, cada una con su fecha. «Ver todas (N)» abre la lista completa en la misma tarjeta. El editor y lo propuesto quedan igual |

### Inicio de la Exploración (`components/exploraciones/InicioDeLaExploracion.tsx`)

| # | Pieza de antes | Destino |
|---|---|---|
| 1 | Encabezado «Exploración» y su bajada | Queda igual |
| 2 | Objetivo y desafío (`ObjetivoYDesafio`) | Queda igual |
| 3 | «Dónde quedó» (`DondeQuedo`) | **Sale.** Lo que dice ya está en el estado de la exploración del Resumen (en qué sesión va) y en cada sesión (lo que queda para la próxima). La función `dondeQuedo` de lib queda, con sus pruebas |
| 4 | «Sesiones de la exploración», con la próxima y «Fuera de la exploración» | Queda igual |
| 5 | «Fuentes manuales» (la lista de lo sumado a mano y el formulario para sumar) | **Sale del inicio.** Ya vive en Preparación › «Contexto adicional» › «Fuentes manuales» (la misma lista y el mismo formulario, `SumarAMano`). Además, «Agregar sesión» sigue pudiendo unir algo sumado a mano a una sesión |
| 6 | El arranque «Con una transcripción» (`?sumar=1`, desde `EmpresasDeHubspot.tsx`) | Ahora abre **Preparación** con el «Contexto adicional» desplegado y el formulario de «Fuentes manuales» abierto (`?pieza=preparacion&sumar=1`) |
| 7 | «Instrucciones adicionales» (caja con editor, o «Escribirlas») | **Sale la caja.** Con texto guardado: una línea «Nexus sigue tus instrucciones: «…»» con «Editar» (abre el mismo editor; vaciarlo la quita). Sin texto: nada. La IA las sigue leyendo igual (`claveDeInstrucciones("exploracion")`). Lo nuevo se le cuenta a «Hablar con Nexus» |
| 8 | «Lo que sabes del cliente» (`LoQueSabes`) | Queda igual |
| 9 | «Lo que la IA ya sabe, sin que elijas nada» | Queda igual |
| 10 | El paso del recorrido «Fuentes manuales e instrucciones» | Pasa a apuntar al «Contexto adicional» de Preparación, con su texto nuevo |

## Las tarjetas compactas

- **Qué hace el agente** (`lib/exploraciones/tarjetas-compactas.ts` + `-server.ts`): recibe las líneas confirmadas de
  una tarjeta y devuelve otras más cortas con cuatro reglas de Elías: fusionar duplicados, meter la línea base dentro de
  su objetivo, agrupar por equipo o flujo y quitar relleno sin perder métricas, canales ni restricciones.
- **Modelo:** Haiku (`claude-haiku-4-5`), una sola llamada con todas las tarjetas que faltan. Pasa por el medidor con
  `agentSlug` de la exploración y `origen: exploraciones/agente:tarjetas-compactas`, y deja su `AgentRun`.
- **Cuándo corre:** solo después de un cambio confirmado de una tarjeta del Resumen (el PATCH de la preventa), en
  segundo plano, y solo para las tarjetas cuya huella cambió. Nada corre al abrir la página. Una tarjeta corta (hasta 2
  líneas y 220 caracteres) no se manda: se ve tal cual.
- **La huella:** FNV-1a de las líneas que muestra la tarjeta. Si la guardada no coincide con la de hoy, se muestra lo de
  siempre recortado.
- **Verificación antes de guardar:** toda cifra de la versión compacta tiene que estar en el original y ningún rango
  queda al revés (`cifrasQueNoCuadran`). Desde la segunda vuelta, soltar cifras se permite. La que no pasa se pide
  una vez más con el motivo; si tampoco, se descarta y sigue lo de siempre.
- **Tamaño:** como mucho 4 puntos de una línea por tarjeta (ver «Segunda vuelta», abajo; la primera fue de 8).
- **Dónde se guarda:** `contenido.tarjetasCompactas[clave] = { huella, lineas, en }`, en el JSON que ya tiene la
  exploración. **Sin SQL.** No sube la versión (como la descripción de la escala): es material de pantalla, no algo
  confirmado. Tampoco mueve la fecha de actividad de la preventa (`updatedAt`).
- **Contexto:** solo las casillas de esa exploración, de esa empresa. Ni reuniones ni nada de otra cuenta.
- **Las que ya existen:** `scripts/compactar-tarjetas-del-resumen.ts`, simulacro por default (imprime original y
  compacta y la verificación), `--apply` escribe. Lee de producción solo si se le pide.

## Las particularidades con su fecha

Hoy son una lista de textos sin fecha. Desde este cambio, cada una que entra (al usar una sugerencia, con «Hablar con
Nexus» o editando la casilla) guarda el día en `contenido.fechasDeLasParticularidades` (por su texto normalizado). Las
de antes no tienen fecha registrada: se muestran sin fecha, en el orden en que entraron (la lista se arma agregando al
final, así que las últimas son las más recientes).

## Validación con preventas reales (base local, 22 nov)

Simulacro con 3 exploraciones reales copiadas a la local (SmartAgro ×2, Cemaco · Costa Rica): 6 de 6 tarjetas pasaron
la comprobación en la última corrida. Cemaco: metas de 11 a 8 puntos, retos de 16 a 10. Con `--apply` se guardaron 4
de 6 (Haiku varía entre corridas: las otras dos perdían cifras y quedaron con lo de siempre recortado, que es lo que
tiene que pasar).

## DECISIONS que se corrigen

- «La exploración desde el vendedor» › «El Resumen arriba» (sin hallazgos; tarjetas compactas; particularidades).
- «La exploración guiada» › «Dónde quedó (punto 16)» (sale del inicio).
- «La exploración son sus sesiones» › la página de inicio (fuentes manuales e instrucciones).

## Segunda vuelta (22 nov, tarde): 4 puntos por tarjeta

Elías vio Cemaco · Ecuador en producción y las tarjetas casi no se acortaron (8 puntos largos; Retos con «+17 más»).
Regla nueva:

- Como mucho 4 puntos por tarjeta, de una línea (unas 15 palabras; tope duro 26 y 200 letras).
- Fusionar de verdad lo que repite la misma idea y juntar en un punto lo de un mismo departamento o flujo.
- Solo las cifras que importan para proponer. Nunca una inventada ni al revés; soltar cifras sí se permite.
- La huella lleva la versión de las reglas: las compactas de la primera vuelta dejan de mostrarse hasta rearmarlas
  (`scripts/compactar-tarjetas-del-resumen.ts --todas --apply`).

Simulacro de solo lectura contra producción (Cemaco · Costa Rica y Cemaco · Ecuador): 10 de 10 tarjetas pasan. Costa
Rica: metas de 11 a 4 puntos, retos de 16 a 4. Ecuador: metas de 11 a 4, planes de 11 a 4, retos de 21 a 4.
