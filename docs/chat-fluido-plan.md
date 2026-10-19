# El chat de Nexus sobre la guía, fluido (validaciones 71, 104, 106 y 107 del roadmap)

> Elías probó el 18 oct «Mejorar con el asistente» con Distribuidora Larce. Funciona, pero se siente como un
> formulario: pide permiso en texto, después muestra la lista, después repite lo aplicado, y tarda. Quiere que se
> sienta como hablar con Claude: corto, directo y rápido. La lista de cambios sigue siendo lo que se aplica, y la
> aplica la persona.

## Lo que pasaba

1. **Tres resúmenes de lo mismo.** «¿Qué otras preguntas agregarías?» → el chat listó 4 preguntas en texto y preguntó
   «¿Las agrego las cuatro?». «Sí» → recién ahí la caja «Lo que se acordó» con el texto del modelo (otra vez las 4), el
   contador «4 cambios» y «Aplicar 4 cambios». Al aplicar: la caja «· ya aplicado» con «Aplicado. ¿Hay que cambiar algo
   más?» y además un turno «✅ Se aplicó: …» con las 4 líneas enteras.
   - Causa: el prompt dice «Si falta un dato que importa, pregúntalo» y «Después, en una o dos líneas, di qué cambiaste»;
     el modelo lo lee como pedir permiso y como resumir. El desenlace (`textoDelDesenlace`) copia cada línea aplicada.
2. **Las repreguntas no se cambiaban en un paso.** `guia.repregunta.cambiar` valida cada número contra las repreguntas
   de HOY: con 0, la 2 y la 3 se rechazan aunque la 1 venga en la misma lista. Y el prompt no dice que
   `guia.pregunta.cambiar` con `repreguntas` las reemplaza todas.
   - La pregunta 1.1 tenía 0 repreguntas porque es una **pregunta de respaldo**: cuando el agente no escribió una del
     paso que toca (o la suya repetía lo sabido), `guia.ts` pone la del código (`preguntaDeRespaldo`) con `repreguntas: []`.
3. **«Regenerar pregunta»** está como enlace suelto debajo de cada pregunta; el menú ⋯ ya existe con Editar, Volver a la
   de la guía y Quitar.
4. **Lento.** Un turno sobre la guía son 2 llamadas al modelo (la que propone y otra que solo escribe el resumen), con el
   razonamiento de Sonnet 5 encendido por defecto (`effort` alto), y la guía se arma de nuevo (`contextoParaLaGuia`)
   por cada cambio que se prepara, otra vez al aplicar y otra en cada escritura.

## Lo que se hace

### 1. Fluido (prompt, bucle y pantalla)
- **Prompt**: con el pedido claro, propone directo con las herramientas, sin pedir permiso: la lista ES la confirmación.
  Pregunta solo si falta algo que cambia el resultado (para quién, qué día). Después de proponer, UNA línea que no repite
  la lista. Nunca «aplica esto y seguimos»: todo lo que pidió va en la misma lista.
- **Bucle**: si en una vuelta el modelo solo propuso (sin leer) y nada se rechazó, el turno termina ahí: no hace falta
  otra llamada para escribir el resumen. El texto es el que el modelo escribió antes de las herramientas o, si no
  escribió nada, una línea que arma el código («Te dejé 4 cambios en la lista.»).
- **Pantalla**: la caja de la lista dice su título con la cuenta («4 cambios para aplicar») y no repite el contador;
  aplicada, solo el título («· aplicado») sin otro párrafo. El desenlace es una línea agrupada por clase
  («Listo: 4 preguntas en la guía.»), sin las líneas enteras. El aviso fijo del cajón, más corto.

### 2. Repreguntas
- `guia.pregunta.cambiar` con `repreguntas` las reemplaza todas (ya lo hace); el prompt y la descripción lo dicen.
- `guia.repregunta.cambiar` acepta cualquier número del 1 al 3 al preparar; al aplicar se ubica sobre las de ese momento
  (como ya hace), así tres en la misma lista entran juntas.
- La pregunta de respaldo trae 3 repreguntas por paso (`REPREGUNTAS_DEL_PASO`), puras y probadas.

### 3. Menú ⋯ de cada pregunta
- Con la primitiva `Menu`: Regenerar, Editar, Volver a la de la guía (si aplica) y Borrar. Borrar avisa con «Deshacer»
  (una de la guía se devuelve; una propia se vuelve a agregar igual).

### 4. Rapidez, medida
- `scripts/medir-turno-de-la-guia.ts` corre el turno real (sin escribir el hilo ni la exploración) y mide: armar el
  contexto, cada llamada al modelo, preparar los cambios y volver a prepararlos como al aplicar.
- `effort` del chat de Nexus: `low` (chat; la guía y sus reglas las sostiene el código al preparar). Medido antes y
  después.
- La guía se arma una vez por turno y una vez por aplicar (`contextoParaLaGuia` con memoria por pedido).
- Sin streaming en esta tanda: el turno termina en una sola llamada en el caso común, y el streaming pide cambiar la ruta
  y el cajón compartido de los tres chats. Queda anotado.

### 5. La 107
- Misma regla del punto 1 («¿La agrego así?» ya no va).

## Lo que no cambia
- La lista sigue siendo lo que se aplica, y la aplica la persona. Nada se escribe solo.
- Una cuenta por hilo; las operaciones verifican que la exploración sea de esa empresa.

## Resultado (2026-10-18, Distribuidora Larce, `scripts/medir-turno-de-la-guia.ts`)

| Pedido | Antes | Después |
|---|---|---|
| «¿Qué otras preguntas agregarías?» | 34,4 s: llamada 1 27,8 s (2.659 tokens de salida), llamada 2 3,0 s | 10,4 s: una sola llamada de 7,6 s (733 de salida) |
| «Mejora las repreguntas de la pregunta 2 para que bajen a números» | 21,0 s: 8,3 + 10,0 s, y rechazó la tercera repregunta | 4,8 s: una llamada de 3,4 s, las tres repreguntas en un cambio |

Preparar cada cambio pasó de 0,4–0,5 s a 0,1–0,2 s. Armar el contexto de la cuenta sigue en 1–2,5 s (la memoria); va en
paralelo con la guía.
