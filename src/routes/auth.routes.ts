import { Router } from 'express';
import { register, login, getMe, createUser, listUsers, updateUserRole, deleteUser } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkFga } from '../middleware/authz.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/users', authenticate, checkFga('system', () => 'global', 'admin'), createUser);
router.get('/users', authenticate, listUsers);
router.put('/users/:id/role', authenticate, checkFga('system', () => 'global', 'admin'), updateUserRole);
router.delete('/users/:id', authenticate, checkFga('system', () => 'global', 'admin'), deleteUser);
router.get('/me', authenticate, getMe);


export default router;
