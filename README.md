# Finanzas

App personal de registro de gastos: bot de Telegram + Google Sheet + una PWA para el
iPhone. Sin servidor propio y sin base de datos.

Para trabajar en el proyecto, **empezá por [`CLAUDE.md`](CLAUDE.md)**: ahí está el
porqué, el modelo de datos, las reglas de trabajo, las trampas que ya nos costaron un
bug en producción y los pendientes.

Para armar todo desde cero en otra cuenta, está [`INSTALACION.md`](INSTALACION.md).

---

## Arranque rápido

```bash
npm install                 # playwright y pdfjs-dist

npm test                    # las cinco suites de backend
npm run build               # arma index.html y sw.js en la raíz
npm run server              # servidor de prueba en http://localhost:8099
```

Las pruebas de interfaz necesitan el servidor levantado en otra terminal:

```bash
DIST=1 npm run server       # en una terminal
npm run test:app            # en otra: comportamiento de la app
npm run shots               # capturas de todas las pantallas
```

Las pruebas de backend necesitan `test/datos.json`, que no está en el repo por
privacidad (son cuatro años de movimientos reales). Está en la máquina de Fa.

## Publicar

```bash
npm run build && git add -A && git commit -m "..." && git push
```

GitHub Pages publica `index.html` y `sw.js` de la raíz. **Los dos son generados: no
se editan a mano.** Los fuentes de la app viven en `pwa/`.

El backend es aparte: hay que pegar los `.gs` en el editor de Apps Script y hacer
**Gestionar implementaciones → ✏️ → Versión: Nueva**.
