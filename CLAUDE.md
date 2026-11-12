# Muro Interactivo — guía para Claude

App de una presentación en directo: el público escanea un QR y sube archivos desde el móvil; el presentador los coloca, edita y anota en un muro que se proyecta. Interfaz y textos en **español**.

## Estructura
- `server.js` — Express + Socket.IO + multer. Guarda el estado en `data/state.json` y los archivos en `data/uploads/`. Un único objeto `state = { settings, elements }`; cada cambio llama a `broadcast()`, que envía el estado completo a la sala `admin` y una versión filtrada (`publicState()`) a la sala `viewer`.
- `public/upload.html` — página del público (`/`). Reduce fotos en el móvil antes de subir (máx. 2560 px).
- `public/panel.html` + `panel.js` + `panel.css` — el mismo código sirve `/panel` (presentador, con PIN) y `/pantalla` (proyector, solo lectura). `MODE` = `'admin'` o `'view'` según la ruta; todo lo que va después de `if (MODE === 'view') { … return; }` en `panel.js` es solo del panel.
- `render.yaml` — despliegue en Render (plan gratuito, disco efímero).

## Modelo de datos
- Elemento: `{ id, kind: image|video|audio|pdf|doc|text, status: live|pending, hidden, x, y, w, h, rot, z, file?, author?, message?, showCaption?, text?, style?, parent?, playing?, muted? }`.
- Coordenadas en un espacio de referencia de **1920×1080** (`#space`). El tablero (`#board`) se estira para llenar la pantalla; esa zona central se ve siempre entera. `/pantalla` envía su tamaño de ventana (`screen`) y el panel dibuja el tablero con esa misma proporción (16:9 si no hay proyector conectado), para que el presentador vea exactamente el mismo recorte.
- **Textos anclados**: un texto con `parent` = id de una foto guarda `x, y, rot` relativos a la foto y se dibuja *dentro* del nodo de la foto. Si la foto cambia de anchura, `scaleChildren()` (existe en servidor y cliente, mantenlos iguales) escala posición, ancho y tamaño de letra. Borrar una foto borra sus textos.
- Ediciones de foto: el servidor guarda la nueva imagen en `file.url` y conserva `file.originalUrl`.

## Convenciones
- Sin framework ni build: HTML/CSS/JS plano. Iconos SVG en el objeto `ICON` de `panel.js`.
- El cliente aplica los cambios en local y los envía agrupados (`queue()` / `flush()`); el servidor valida cada campo en el manejador `update`. Si añades un campo editable, añádelo también a esa lista blanca.
- Archivos subidos se sirven con CSP `sandbox` y `nosniff`; los tipos no visualizables se descargan.
- Responsive: en `/pantalla` con pantalla vertical se usa la vista en columna (`body.feed`, `renderFeed()`); en el panel, por debajo de 900 px la lista lateral es un panel inferior y la barra de herramientas va fija abajo.

## Ejecutar y probar
```bash
npm install
ADMIN_PIN=4321 PORT=3100 npm start   # /  /panel  /pantalla
```
Para subir archivos de prueba sin móvil:
```bash
curl -F files=@foto.jpg -F 'dims=[{"w":1600,"h":1200}]' -F author=Ana -F 'message=Hola' localhost:3100/api/upload
```
Después de cambiar algo, compruébalo en el navegador en escritorio y en un tamaño de móvil (390×844), en `/panel` y `/pantalla`. Borra `data/` para empezar de cero.
