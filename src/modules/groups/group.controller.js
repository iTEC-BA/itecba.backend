import Group from './group.model.js';
import { notFound, badRequest } from '../../middlewares/errorHandler.js';
import { sendNotificationEmail } from '../../config/mailer.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'soporte.itecba@gmail.com';

/** Valores permitidos – previene inyección de valores no esperados */
const VALID_CARRERAS = new Set([
  'sistemas', 'industrial', 'civil', 'electronica',
  'electrica', 'mecanica', 'quimica', 'naval',
  'textil', 'homogeneas', 'ingreso',
]);
const VALID_NIVELES = new Set(['0', '1', '2', '3', '4', '5', '6']);

/** Grupos por página (límite duro) */
const PAGE_SIZE = 16;

/** Escapa caracteres especiales de regex para evitar ReDoS */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─── GET /api/groups ─────────────────────────────────────────────────────────
// Requiere: (carrera + nivel + materia) O (comision ≥ 3 chars)
// Paginado: max 16 resultados por página
// ─────────────────────────────────────────────────────────────────────────────
export const getApprovedGroups = async (req, res, next) => {
  try {
    // ── Sanitización ─────────────────────────────────────────
    const rawCarrera  = String(req.query.carrera  || '').trim().toLowerCase().slice(0, 30);
    const rawNivel    = String(req.query.nivel    || '').trim().slice(0, 2);
    const rawMateria  = String(req.query.materia  || '').trim().slice(0, 120);
    // Comisión: solo alfanumérico, máx 10 chars
    const rawComision = String(req.query.comision || '').trim()
      .replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10);
    const page = Math.max(1, Math.min(9999, parseInt(req.query.page) || 1));

    // ── Validación de whitelist ───────────────────────────────
    if (rawCarrera && !VALID_CARRERAS.has(rawCarrera)) {
      return next(badRequest('Especialidad inválida.'));
    }
    if (rawNivel && !VALID_NIVELES.has(rawNivel)) {
      return next(badRequest('Nivel inválido.'));
    }

    // ── Regla de negocio: al menos un filtro significativo ────
    const hasComision  = rawComision.length >= 3;
    const hasFullFilter = !!(rawCarrera && rawNivel && rawMateria);

    if (!hasComision && !hasFullFilter) {
      return res.status(400).json({
        error:   true,
        message: 'Completá Especialidad + Nivel + Materia, o ingresá una Comisión (mín. 3 caracteres).',
      });
    }

    // ── Construcción del filtro MongoDB ───────────────────────
    const filter = { isApproved: true };

    if (hasComision) {
      // Búsqueda por comisión: prefijo exacto (más eficiente que regex libre)
      filter.comision = { $regex: `^${escapeRegex(rawComision)}`, $options: 'i' };
    } else {
      // Grupos homogéneas aparecen en búsquedas de cualquier carrera de ingeniería
      const isEngineeringCarrera = rawCarrera !== 'homogeneas' && rawCarrera !== 'ingreso';
      if (isEngineeringCarrera) {
        filter.$or = [{ carrera: rawCarrera }, { carrera: 'homogeneas' }];
      } else {
        filter.carrera = rawCarrera;
      }
      if (rawNivel)   filter.nivel   = rawNivel;
      if (rawMateria) filter.materia = { $regex: escapeRegex(rawMateria), $options: 'i' };
    }

    // ── Consulta paginada ─────────────────────────────────────
    const skip = (page - 1) * PAGE_SIZE;
    const [groups, total] = await Promise.all([
      Group.find(filter)
        .sort({ tipo: -1, createdAt: -1 })  // Oficiales primero
        .skip(skip)
        .limit(PAGE_SIZE)
        .lean(),
      Group.countDocuments(filter),
    ]);

    res.status(200).json({
      groups,
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE) || 1,
      hasMore: skip + groups.length < total,
    });
  } catch (err) { next(err); }
};

// ─── GET /api/groups/stats  (solo admin) ─────────────────────────────────────
export const getGroupStats = async (req, res, next) => {
  try {
    const [total, oficiales, reportados, carreras] = await Promise.all([
      Group.countDocuments({ isApproved: true }),
      Group.countDocuments({ isApproved: true, tipo: 'Oficial' }),
      Group.countDocuments({ isApproved: true, reportCount: { $gt: 0 } }),
      Group.distinct('carrera', { isApproved: true }),
    ]);
    res.status(200).json({ total, oficiales, reportados, carreras: carreras.length });
  } catch (err) { next(err); }
};

// ─── GET /api/groups/pending  (admin) ────────────────────────────────────────
export const getPendingGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ isApproved: false }).sort({ createdAt: -1 }).lean();
    res.status(200).json(groups);
  } catch (err) { next(err); }
};

// ─── GET /api/groups/reported  (admin) ───────────────────────────────────────
export const getReportedGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ reportCount: { $gt: 0 }, isApproved: true })
      .sort({ reportCount: -1 })
      .lean();
    res.status(200).json(groups);
  } catch (err) { next(err); }
};

// ─── POST /api/groups ────────────────────────────────────────────────────────
export const createGroup = async (req, res, next) => {
  try {
    const doc = await Group.create({
      ...req.body,
      submittedBy: req.user?.uid ?? 'anon',
      isApproved:  false,
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
};

// ─── PUT /api/groups/:id/approve  (admin) ────────────────────────────────────
export const approveGroup = async (req, res, next) => {
  try {
    const doc = await Group.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
    if (!doc) return next(notFound('Grupo no encontrado'));
    res.status(200).json(doc);
  } catch (err) { next(err); }
};

// ─── PUT /api/groups/:id/link  (admin) ───────────────────────────────────────
export const updateGroupLink = async (req, res, next) => {
  try {
    const { link } = req.body;
    if (!link || !link.startsWith('http')) {
      return res.status(400).json({ message: 'Link inválido. Debe comenzar con http/https.' });
    }
    const doc = await Group.findByIdAndUpdate(
      req.params.id,
      { link, reports: [], reportCount: 0 },
      { new: true }
    );
    if (!doc) return next(notFound('Grupo no encontrado'));
    res.status(200).json(doc);
  } catch (err) { next(err); }
};

// ─── POST /api/groups/:id/report ─────────────────────────────────────────────
export const reportGroup = async (req, res, next) => {
  try {
    const VALID_REASONS = ['link-invalido', 'link-incorrecto', 'grupo-lleno', 'otro'];
    const { reason = 'link-invalido', reporterEmail } = req.body;
    const reporterUid  = req.user?.uid ?? 'anon';
    const reporterMail = reporterEmail || req.user?.email || 'sin-email';

    if (!VALID_REASONS.includes(reason)) {
      return next(badRequest(`Motivo inválido. Opciones: ${VALID_REASONS.join(', ')}`));
    }

    const doc = await Group.findById(req.params.id);
    if (!doc) return next(notFound('Grupo no encontrado'));

    const alreadyReported = doc.reports.some(r => r.reportedBy === reporterUid);
    if (alreadyReported) {
      return res.status(409).json({ message: 'Ya reportaste este grupo.' });
    }

    doc.reports.push({ reportedBy: reporterUid, reason });
    doc.reportCount = doc.reports.length;
    await doc.save();

    // Notificación al admin
    const adminHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#b71234">⚠️ Grupo reportado en iTEC</h2>
        <p><strong>Materia:</strong> ${doc.materia}</p>
        <p><strong>Comisión:</strong> ${doc.comision}</p>
        <p><strong>Carrera:</strong> ${doc.carrera}</p>
        <p><strong>Link actual:</strong> <a href="${doc.link}">${doc.link}</a></p>
        <p><strong>Motivo:</strong> ${reason}</p>
        <p><strong>Reportado por (UID):</strong> ${reporterUid}</p>
        <p><strong>Total de reportes:</strong> ${doc.reportCount}</p>
        <hr>
        <p style="font-size:12px;color:#666">Revisar en el panel de administración de iTEC.</p>
      </div>
    `;
    await sendNotificationEmail(
      ADMIN_EMAIL,
      `[iTEC] Grupo reportado: ${doc.materia} ${doc.comision}`,
      adminHtml
    );

    if (reporterMail && reporterMail !== 'sin-email') {
      const userHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#004aad">Gracias por tu reporte - iTEC</h2>
          <p>Recibimos tu reporte del grupo de <strong>${doc.materia}</strong> (Comisión ${doc.comision}).</p>
          <p>Nuestro equipo revisará el link a la brevedad.</p>
          <p>Motivo indicado: <em>${reason}</em></p>
          <hr>
          <p style="font-size:12px;color:#666">iTEC BA – Plataforma estudiantil UTN FRBA</p>
        </div>
      `;
      await sendNotificationEmail(
        reporterMail,
        `[iTEC] Reporte recibido: ${doc.materia}`,
        userHtml
      );
    }

    res.status(200).json({ message: 'Reporte enviado. Gracias por colaborar.', reportCount: doc.reportCount });
  } catch (err) { next(err); }
};

// ─── DELETE /api/groups/:id  (admin) ─────────────────────────────────────────
export const deleteGroup = async (req, res, next) => {
  try {
    const doc = await Group.findByIdAndDelete(req.params.id);
    if (!doc) return next(notFound('Grupo no encontrado'));
    res.status(200).json({ message: 'Grupo eliminado' });
  } catch (err) { next(err); }
};
