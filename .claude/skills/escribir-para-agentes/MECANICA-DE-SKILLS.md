# Mecánica de las skills

La rama de [`escribir-para-agentes`](SKILL.md) que vale solo cuando el documento es una skill: frontmatter, quién la invoca y skills enrutadoras. Todo lo demás está en `SKILL.md`.

## Dónde viven

En Nexus, `.claude/skills/<nombre>/SKILL.md`, versionadas en git para que las dos PCs tengan las mismas. El nombre de la carpeta es el comando (`/retro`). Los archivos de apoyo van en la misma carpeta y se nombran desde `SKILL.md`.

## Invocación

Dos opciones, que intercambian las dos cargas:

- **La invoca el modelo**: la skill tiene `description`, así que el agente la puede disparar solo y otras skills la alcanzan. La persona igual la puede escribir: que la invoque el modelo siempre _incluye_ que la invoque la persona. La descripción es el puntero de contexto principal de la skill y queda cargada siempre: carga de contexto permanente a cambio de que se encuentre sola. Una skill de este tipo que es pura referencia también sirve como hogar de referencia compartida: otra skill la invoca, y esa referencia vive en un solo lugar. Mecánica: sin `disable-model-invocation`, y una descripción escrita para el modelo con las ramas que la disparan (las reglas de punteros de `SKILL.md` aplican enteras).
- **La invoca la persona**: el agente no ve la descripción; solo la persona que escribe su nombre la dispara, y ninguna otra skill puede. Cero carga de contexto, pero gasta carga cognitiva: la persona es el índice que tiene que acordarse de que existe. Mecánica: `disable-model-invocation: true`; la `description` pasa a ser para la persona: un resumen de una línea, sin lista de disparadores.

Elige que la invoque el modelo solo cuando el agente tiene que llegar a ella solo, u otra skill tiene que llegar. Si solo se usa a mano, que la invoque la persona y no pague carga de contexto.

La referencia que necesitan dos skills que invoca la persona no puede vivir en ninguna de las dos: sin descripciones, ninguna dispara a la otra. Va en un archivo común fuera del sistema de skills (un doc de `docs/`) al que las dos apuntan.

## Partir por invocación

El corte por invocación (el corte por secuencia está en `SKILL.md`): separa una skill que invoca el modelo cuando tienes una palabra ancla propia que debería dispararla sola (una que de verdad usas en tus pedidos), u otra skill tiene que alcanzarla. Pagas la carga de contexto de una descripción nueva siempre cargada, así que ese alcance propio tiene que valer la pena.

## Skills enrutadoras

Cuando las skills que invoca la persona son más de las que se pueden recordar, esa carga cognitiva se cura con una **skill enrutadora**: una skill que invoca la persona, que nombra a las otras y dice cuándo usar cada una, así hay que recordar una sola. Solo puede sugerir, nunca disparar: las otras no tienen descripción visible para el agente.
