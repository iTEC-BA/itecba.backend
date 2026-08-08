// src/modules/pageAccess/pageAccess.middleware.js
//
// Middleware OPCIONAL para usar en las rutas de API de un módulo cuya página
// asociada puede estar desactivada (ej: si "/trueketec" está deshabilitada,
// también podés bloquear POST /api/trueketec). No se aplica automáticamente
// a ningún módulo existente — es un helper para agregar donde haga falta.
//
// Uso:
//   import { requirePageAccess } from "../pageAccess/pageAccess.middleware.js";
//   router.use(requirePageAccess("/trueketec"));
import { getPageAccessConfig } from "./pageAccess.service.js";
import { forbidden } from "../../middlewares/errorHandler.js";

// Cache en memoria de corta duración: evita pegarle a Firestore en cada
// request de APIs protegidas por esta guarda.
let cache = null;
let cacheTs = 0;
const CACHE_TTL_MS = 30 * 1000;

const getConfigCached = async () => {
  if (cache && Date.now() - cacheTs < CACHE_TTL_MS) return cache;
  cache = await getPageAccessConfig();
  cacheTs = Date.now();
  return cache;
};

export const requirePageAccess = (path) => async (req, res, next) => {
  try {
    // Los admins siempre pasan: necesitan poder seguir gestionando/probando
    // una sección aunque esté desactivada para el resto.
    if (req.user?.role === "admin") return next();

    const config = await getConfigCached();
    const state = config.pages?.[path];

    if (state && state.enabled === false) {
      return next(forbidden("Esta sección no está disponible en este momento."));
    }
    next();
  } catch (err) {
    next(err);
  }
};
