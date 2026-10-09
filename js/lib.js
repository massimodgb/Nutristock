// Librerías externas, en un solo sitio para poder cambiarlas fácilmente.
// - Preact + htm: dibujan la interfaz (como React, pero muy ligero y sin instalar nada).
// - Dexie: guarda los datos en el propio teléfono (IndexedDB).
export {
  html, render, useState, useEffect, useMemo, useRef, useCallback, useErrorBoundary,
} from 'https://unpkg.com/htm@3.1.1/preact/standalone.module.js';

import Dexie, { liveQuery } from 'https://unpkg.com/dexie@4.0.8/dist/dexie.mjs';
export { Dexie, liveQuery };
