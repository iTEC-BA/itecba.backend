import { getRawProgress, setSubjectEntry, updateMeta, upsertProgress } from "./progress.model.js";
import { dbFirebase } from "../../config/firebase-admin.js";

// CORRECCIÓN 2: Se agrega "pr" a los estados válidos esperados por el frontend
const VALID_STATES = new Set(["a", "pr", "promocionada", "r", "c"]);

const CAREER_CODE_MAP = {
  K: 'sistemas', S: 'sistemas', M: 'mecanica', E: 'electronica', 
  L: 'electrica', C: 'civil', I: 'industrial', Q: 'quimica', 
  N: 'naval', T: 'textil'
};

const parseGrade = (n) => {
  const num = Number(n);
  return Number.isFinite(num) && num >= 1 && num <= 10 ? Math.round(num) : undefined;
};

export const getProgress = async (req, res, next) => {
  try {
    const { uid } = req.params;
    if (req.user.uid !== uid) return res.status(403).json({ error: "No autorizado" });

    const [raw, userDoc] = await Promise.all([
      getRawProgress(uid),
      dbFirebase.collection("users").doc(uid).get()
    ]);

    let enrolledCareers = raw?.enrolledCareers || [];
    let activeCareer = raw?.activeCareer || null;

    if (enrolledCareers.length === 0 && userDoc.exists) {
      const userData = userDoc.data();
      if (Array.isArray(userData.careers) && userData.careers.length > 0) {
        enrolledCareers = userData.careers
          .map(c => CAREER_CODE_MAP[c.code?.toUpperCase()] || c.name?.toLowerCase())
          .filter(Boolean);
      } else if (userData.specialty) {
        const specMapped = CAREER_CODE_MAP[userData.specialty.charAt(0).toUpperCase()];
        enrolledCareers = specMapped ? [specMapped] : ["sistemas"];
      }
      
      activeCareer = enrolledCareers[0] || "sistemas";
      
      if (enrolledCareers.length > 0) {
        await updateMeta(uid, { enrolledCareers, activeCareer });
      }
    }

    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");

    return res.status(200).json({
      activeCareer:    activeCareer,
      enrolledCareers: enrolledCareers,
      p:               raw?.p || {},
    });
  } catch (err) {
    next(err);
  }
};

export const updateSubject = async (req, res, next) => {
  try {
    const { uid } = req.params;
    if (req.user.uid !== uid) return res.status(403).json({ error: "No autorizado" });

    const { codigo, state, grade, year } = req.body;
    if (!codigo || typeof codigo !== "string") {
      return res.status(400).json({ error: "Código requerido" });
    }

    if (state === null || state === "habilitada_cursar" || state === "bloqueada") {
      await setSubjectEntry(uid, codigo, null);
      return res.status(200).json({ ok: true, state: null });
    }

    if (!VALID_STATES.has(state)) {
      return res.status(400).json({ error: `Estado inválido: ${state}` });
    }

    const entry = { s: state };
    if (state === "a" || state === "pr" || state === "promocionada") {
      const g = parseGrade(grade);
      if (g !== undefined) entry.n = g;
      if (year) entry.y = Number(year);
    } else if (state === "r" && year) {
      entry.y = Number(year);
    }

    await setSubjectEntry(uid, codigo, entry);
    return res.status(200).json({ ok: true, entry });
  } catch (err) {
    next(err);
  }
};

export const bulkSaveProgress = async (req, res, next) => {
  try {
    const { uid } = req.params;
    if (req.user.uid !== uid) return res.status(403).json({ error: "No autorizado" });

    const { activeCareer, enrolledCareers, p } = req.body;
    if (!Array.isArray(enrolledCareers) || typeof p !== "object") {
      return res.status(400).json({ error: "Payload incompleto" });
    }

    const sanitizedP = {};
    for (const [codigo, entry] of Object.entries(p)) {
      if (!entry || !VALID_STATES.has(entry.s)) continue;
      const clean = { s: entry.s };
      if (["a", "pr", "promocionada"].includes(entry.s) && entry.n) clean.n = Number(entry.n);
      if (entry.y) clean.y = Number(entry.y);
      sanitizedP[codigo] = clean;
    }

    await upsertProgress(uid, {
      activeCareer: activeCareer || enrolledCareers[0] || null,
      enrolledCareers: enrolledCareers.slice(0, 3),
      p: sanitizedP,
    });
    return res.status(200).json({ ok: true, saved: Object.keys(sanitizedP).length });
  } catch (err) {
    next(err);
  }
};
