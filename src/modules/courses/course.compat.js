/**
 * course.compat.js
 * Wrapper de compatibilidad: getCourses puede retornar array plano (legacy)
 * o { courses, pagination } según el header Accept-Version.
 *
 * El frontend NUEVO (coursesService.ts actualizado) envía ?page=&limit= y
 * espera { courses, pagination }.
 * El frontend LEGACY espera un array.
 *
 * Por ahora devolvemos SIEMPRE { courses, pagination } y el frontend
 * coursesService.ts maneja ambos formatos.
 */

// Mapeo de compatibilidad en coursesService.ts del frontend:
// const data = await res.json();
// const list = Array.isArray(data) ? data : (data.courses ?? []);
export const COMPAT_NOTE = "Ver coursesService.ts para manejo dual de respuesta";
