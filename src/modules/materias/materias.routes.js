import { Router } from 'express';
import { body }   from 'express-validator';
import { validate }                  from '../../middlewares/validate.js';
import { verifyToken, requireAdmin } from '../../middlewares/authMiddleware.js';
import {
  getMaterias,
  getCarreras,
  createMateria,
  updateMateria,
  deleteMateria,
} from './materias.controller.js';

const router = Router();

const materiaValidators = [
  body('carrera').trim().notEmpty().withMessage('carrera requerida'),
  body('nivel').trim().notEmpty().withMessage('nivel requerido'),
  body('materia').trim().notEmpty().withMessage('materia requerida'),
];

router.get('/',          getMaterias);
router.get('/carreras',  getCarreras);
router.post('/',         verifyToken, requireAdmin, materiaValidators, validate, createMateria);
router.put('/:id',       verifyToken, requireAdmin, materiaValidators, validate, updateMateria);
router.delete('/:id',    verifyToken, requireAdmin, deleteMateria);

export default router;
