---
name: revisar-banco-del-test
description: Contrasta las preguntas del test del diagnóstico y sus variantes de CRM contra la escala. Úsala cuando cambie la versión de la escala (`escalaVersion`, o la prueba variantes.test.ts en rojo), al tocar variantes-de-crm.datos.ts o al editar un banco en Escala › Tests.
---

# Revisar el banco del test

El banco tiene dos capas: la base (sale de la escala) y las variantes por grupo (`lib/tests-diagnostico/variantes-de-crm.datos.ts`). Una variante mide EXACTAMENTE el nivel de su base; las reglas viven en la cabecera de `lib/tests-diagnostico/variantes.ts`. Esta revisión corre en Claude Code y no gasta IA dentro de Nexus.

**La marca que la dispara:** `ESCALA_DE_LAS_VARIANTES` (el archivo de datos) distinta de `version:` en `docs/escala/escala_rendimiento_smarteam.md`. La prueba `lib/tests-diagnostico/variantes.test.ts` se pone en rojo con eso. En la base, la misma señal es `PreguntasDelTest.escalaVersion` distinta de la escala publicada. Esa prueba solo ve palabras: que el nivel siga siendo el mismo lo juzga esta skill.

## 1. Delimitar qué cambió

```bash
npx vitest run --project unit lib/tests-diagnostico/variantes.test.ts
npx tsx scripts/tests-variantes-crm.ts --todas
```

El primero lista las menciones sin variante y las entradas viejas contra la escala del repo; el segundo, contra los bancos de la base (es simulacro, solo lee). Busca el commit de la versión anterior con `git log -p -S"version: <vieja>" -- docs/escala/escala_rendimiento_smarteam.md` y saca el diff de la escala.

Hecho: lista de dimensiones cuyo enunciado o criterios cambiaron, en la general y en cada edición.

## 2. Contrastar contra el nivel

Abre en la escala la dimensión (`#### 1.2`), no la pantalla: el documento repite las ocho dimensiones por edición. Para cada entrada de las dimensiones cambiadas, y para toda entrada si la versión subió de mayor o menor, lee lado a lado el nivel, la base y las dos variantes, y da un veredicto:

- **Al día**: pide lo mismo que el nivel, con otras palabras.
- **Vieja**: su base ya no existe o el nivel cambió de sentido.
- **Otro nivel**: pide más o menos que su base. Prueba: una empresa real en ese nivel, ¿se reconocería en la variante y no en la opción de al lado?

Mira también las opciones sin variante: un criterio nuevo que nombre una herramienta puede dejar una base que un grupo no debería leer. Si un nivel parece imposible para un grupo, sigue saliendo: se reescribe por lo que hace el equipo, sin esconderlo.

Hecho: cada entrada tocada tiene veredicto, y cada dimensión cambiada quedó vista en las nueve ediciones.

## 3. Proponer y aplicar

Muestra una tabla `Pregunta · Grupo · Hoy · Propuesta · Por qué` con lo vieja u otro nivel, escrita en tuteo y sin nombrar niveles ni códigos. Con el visto bueno:

1. Corrige `variantes-de-crm.datos.ts` y sube `ESCALA_DE_LAS_VARIANTES`, y la prueba queda verde.
2. Si cambiaron las bases, rearma: `npx tsx scripts/tests-preguntas.ts --escala <versión>`. ⚠ Con `--apply` ese script también aprueba; úsalo solo con la revisión hecha. Los bancos que editó una persona no los toca: lístalos.
3. Carga las variantes con simulacro y después `ALLOW_PROD_WRITE=1 npx tsx scripts/tests-variantes-crm.ts --apply`. Queda en el borrador, «Publicado · con cambios sin aprobar».
4. El equipo revisa con «Ver como» en Escala › Tests y un super admin aprueba.

Una variante editada solo en la base se pierde: la fuente es el archivo del repo.
