import { Router } from 'express';
import { body, query } from 'express-validator';
import { validate }                  from '../../middlewares/validate.js';
import { verifyToken, requireAdmin } from '../../middlewares/authMiddleware.js';
import {
  getMaterias,
  searchMaterias,
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
  body('codigo').optional({ nullable: true }).trim(),
];

// Públicas
router.get('/',         getMaterias);
router.get('/carreras', getCarreras);
router.get('/search',
  [query('q').trim().notEmpty().withMessage('Parámetro q requerido')],
  validate,
  searchMaterias
);

// Admin
router.post('/',      verifyToken, requireAdmin, materiaValidators, validate, createMateria);
router.put('/:id',    verifyToken, requireAdmin, materiaValidators, validate, updateMateria);
router.delete('/:id', verifyToken, requireAdmin, deleteMateria);

export default router;
