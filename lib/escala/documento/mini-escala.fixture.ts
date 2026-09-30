/**
 * lib/escala/documento/mini-escala.fixture.ts — una escala de juguete para los tests del lector.
 *
 * Una sola área con dos dimensiones (una por capa), con todas las combinaciones de marcas que
 * admite la etiqueta, un criterio condicionado por «vende sin vendedor» y la prosa que el lector
 * busca. Los textos son inventados: los tests del archivo real van aparte.
 */
export const MINI_ESCALA = `---
documento: Escala de prueba
version: 9.9.9
fecha: 2030-01-01
estado: De juguete
---

# Parte 1 — Qué es

## Las ocho dimensiones

**Base operativa — cómo está montado por dentro.** Texto.

- **Procesos y Rutinas** — si se ejecuta por sistema.

**Producción — qué entrega hacia afuera.** Texto.

- **Alcance** — hasta dónde llega.

## Los cinco niveles de un vistazo

### Deficiente

**Ventas.** Caos.

### Inicial

**Ventas.** Algo.

### Funcional

**Ventas.** Base.

### Eficiente

**Ventas.** Método.

### Óptimo

**Ventas.** Sistema.

# Parte 2 — Cómo se aplica

## Cómo se evalúa cada dimensión

Regla estricta.

**Criterios de riesgo.** Protegen algo.

No impiden llegar a Funcional.

**Niveles por confirmar.** Hábitos.

Tres estados.

## Cómo se verifica cada criterio

**Comprobable.** Está en el sistema.

**Declarado.** Lo dice el cliente.

**Evaluado.** Lo observa alguien.

## Cómo se leen los criterios

Algunas palabras valen fijo. «La mayoría» quiere decir al menos 80%. «Se sostiene» y «de forma consistente» quieren decir en 4 de 5 veces. Y «sin pensarlo», sin mirar el papel.

**Equipos chicos.** Los roles se leen como la función escrita.

## El perfil de negocio

Cada empresa vende distinto.

**Cómo se cierra la venta.** Con equipo, cuando una persona trabaja cada oportunidad; transaccional, cuando nadie la trabaja —en caja o en la web—; o mixta, cuando conviven las dos.

**Qué pasa después de la venta.** Relación única, cuando compra una vez; recompra, cuando vuelve sin contrato; o relación continua, cuando hay contrato.

Las marcas deciden. En la venta mixta aplican todos. Lo demás igual.

En la venta transaccional el negocio es el pedido.
Y el vendedor es el canal.

## Qué se trabaja primero

| Capa | Cuándo | Orden | Por qué |
|:--|:--|:--|:--|
| Base operativa | Ventas | Procesos y Rutinas → Datos | Porque sí. |

## Regla de automatización

El gradiente **manual → autónomo** desempata:

- **Funcional — simple.** Un disparador.
- **Óptimo — la IA ejecuta.** La persona
  valida.

La IA sola no define Óptimo.

## Regla de asignación

Cada evidencia va a una sola dimensión:

- La **reunión recurrente** se asigna a **Procesos**.
- El **forecast** se asigna a **Datos de Ventas (1.3)**, no a Procesos (1.1).
- La **respuesta a un deal que se enfría** se asigna a **Tracción del Deal (1.2)**.
- El **uso de lo que produce otra área** se asigna a la producción.

---

# Parte 3 — La matriz

Intro de la matriz.

## Área 1 — Ventas

Mide Ventas.

### Base operativa

#### 1.1 Procesos y Rutinas

¿La operación sigue sin la persona clave?

*Costo de quedarse:* Se pierde el proceso.

**Deficiente.** Sin proceso.

- Nada escrito. \`[1.1.D1 · declarado]\`

**Inicial.** Algo de estructura.

- Etapas de palabra. \`[1.1.I1 · evaluado]\`

**Funcional.** Maquinaria base.

*Resultado:* Nada depende de una persona.

- Hay un pipeline configurado. \`[1.1.F1 · comprobable]\`
- La definición se aplica igual. \`[1.1.F2 · declarado · hábito · venta con equipo]\`
- Los duplicados están bajo control. \`[1.1.F3 · comprobable · riesgo]\`

**Eficiente.** Método medido.

*Resultado:* El líder corrige con datos.

- Los clientes que vuelven se atienden igual. \`[1.1.E1 · evaluado · cliente recurrente]\`
- El proceso se refina en cadencia. \`[1.1.E2 · declarado · hábito]\`

**Óptimo.** El sistema vigila.

*Resultado:* El proceso se corrige solo.

- La renovación del contrato se anticipa. \`[1.1.O1 · comprobable · relación continua]\`
- El sistema señala desviaciones. \`[1.1.O2 · comprobable]\`

### Producción

#### 1.2 Tracción del Deal

¿Qué pasa cuando un negocio se enfría?

*Qué mide:* Si alguien ve cuando un negocio
deja de avanzar.

*Costo de quedarse:* Los negocios mueren en silencio.

**Deficiente.** Vendedor solo.

- Nadie ayuda. \`[1.2.D1 · evaluado]\`

**Inicial.** Apoyo esporádico.

- Materiales genéricos. \`[1.2.I1 · evaluado]\`

**Funcional.** Respuesta acordada.

*Resultado:* Se rescatan a tiempo.

- Si la empresa vende sin vendedor, esas ventas entran solas al sistema. \`[1.2.F1 · comprobable]\`
- El líder interviene durante el período. \`[1.2.F2 · evaluado · venta con equipo]\`

**Eficiente.** Multicanal.

*Resultado:* Esfuerzo coordinado.

- El contacto está orquestado en cadencias. \`[1.2.E1 · comprobable]\`

**Óptimo.** El sistema detecta fricción.

*Resultado:* Ayuda justo a tiempo.

- La distribución se autoajusta. \`[1.2.O1 · comprobable]\`

---

# Parte 4 — Referencia

## Niveles

| Código | Nivel |
|:--|:--|
| 1 | Deficiente |
| 2 | Inicial |
| 3 | Funcional |
| 4 | Eficiente |
| 5 | Óptimo |

## Dimensiones de base operativa (x.1)

| ID | Dimensión |
|:--|:--|
| x.1 | Procesos y Rutinas |

## Dimensiones de producción (x.2)

| ID | Pregunta | 1 Ventas |
|:--|:--|:--|
| x.2 | Alcance | Tracción del Deal |

## Riesgos

| Identificador | Criterio | Mensaje cuando no se cumple |
|:--|:--|:--|
| \`1.1.F3\` | Duplicados | Tus reportes pueden estar inflados. |

## Glosario

| Término | Qué significa |
|:--|:--|
| Hábito | Algo que el equipo repite. |

## Historial de versiones

**9.9.9 (2030-01-01).** Primera de juguete.
`;

/** La especificación de juguete que acompaña a MINI_ESCALA. */
export const MINI_ESPECIFICACION = `---
documento: Especificación de prueba
version: 1.0.0
escala: 9.9.9
---

Identificadores retirados, que no se vuelven a usar: \`1.1.F9\` y \`1.2.E9\`.
`;

export const MINI_MANUAL = `---
documento: Manual de prueba
version: 1.0.0
escala: 9.9.9
---
`;
