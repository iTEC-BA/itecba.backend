/**
 * normalizeStr
 * Elimina tildes, diacríticos, viñetas y caracteres especiales para búsquedas robustas.
 *
 * Ejemplos:
 *   "Álgebra y Análisis"  → "algebra y analisis"
 *   "Física • Química"    → "fisica  quimica"
 *   "Señal & Sistemas!"   → "senal  sistemas"
 *
 * @param {string} str
 * @returns {string}
 */
export const normalizeStr = (str = "") =>
  String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // quita diacríticos (tildes, diéresis, etc.)
    .replace(/[^\w\s]/g, " ")          // reemplaza viñetas/especiales por espacio
    .toLowerCase()
    .replace(/\s+/g, " ")              // colapsa múltiples espacios
    .trim();
