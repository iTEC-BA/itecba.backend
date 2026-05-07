import Group from './group.model.js';
import { notFound } from '../../middlewares/errorHandler.js';
import { sendNotificationEmail } from '../../config/mailer.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'soporte.itecba@gmail.com';

// GET /api/groups
export const getApprovedGroups = async (req, res, next) => {
  try {
    const { carrera, materia, nivel } = req.query;
    const filter = { isApproved: true };
    if (carrera) filter.carrera = { $regex: carrera, $options: 'i' };
    if (materia) filter.materia = { $regex: materia, $options: 'i' };
    if (nivel)   filter.nivel   = nivel;
    const groups = await Group.find(filter).sort({ createdAt: -1 }).lean();
    res.status(200).json(groups);
  } catch (err) { next(err); }
};

// GET /api/groups/pending  (admin)
export const getPendingGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ isApproved: false }).sort({ createdAt: -1 }).lean();
    res.status(200).json(groups);
  } catch (err) { next(err); }
};

// GET /api/groups/reported  (admin)
export const getReportedGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ reportCount: { $gt: 0 }, isApproved: true })
      .sort({ reportCount: -1 })
      .lean();
    res.status(200).json(groups);
  } catch (err) { next(err); }
};

// POST /api/groups
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

// PUT /api/groups/:id/approve  (admin)
export const approveGroup = async (req, res, next) => {
  try {
    const doc = await Group.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
    if (!doc) return next(notFound('Grupo no encontrado'));
    res.status(200).json(doc);
  } catch (err) { next(err); }
};

// PUT /api/groups/:id/link  (admin)  — cambiar link rápido
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

// POST /api/groups/:id/report  — cualquier usuario autenticado
export const reportGroup = async (req, res, next) => {
  try {
    const { reason = 'link-invalido', reporterEmail } = req.body;
    const reporterUid = req.user?.uid ?? 'anon';
    const reporterMail = reporterEmail || req.user?.email || 'sin-email';

    const doc = await Group.findById(req.params.id);
    if (!doc) return next(notFound('Grupo no encontrado'));

    // Evitar reportes duplicados del mismo usuario
    const alreadyReported = doc.reports.some(r => r.reportedBy === reporterUid);
    if (alreadyReported) {
      return res.status(409).json({ message: 'Ya reportaste este grupo.' });
    }

    doc.reports.push({ reportedBy: reporterUid, reason });
    doc.reportCount = doc.reports.length;
    await doc.save();

    // Notificación a admins (web push via email)
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
    await sendNotificationEmail(ADMIN_EMAIL, `[iTEC] Grupo reportado: ${doc.materia} ${doc.comision}`, adminHtml);

    // Confirmación al usuario que reportó (si tiene email)
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
      await sendNotificationEmail(reporterMail, `[iTEC] Reporte recibido: ${doc.materia}`, userHtml);
    }

    res.status(200).json({ message: 'Reporte enviado. Gracias por colaborar.', reportCount: doc.reportCount });
  } catch (err) { next(err); }
};

// DELETE /api/groups/:id  (admin)
export const deleteGroup = async (req, res, next) => {
  try {
    const doc = await Group.findByIdAndDelete(req.params.id);
    if (!doc) return next(notFound('Grupo no encontrado'));
    res.status(200).json({ message: 'Grupo eliminado' });
  } catch (err) { next(err); }
};
