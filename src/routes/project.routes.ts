import { Router } from 'express';
import { createProject, listProjects, assignUser } from '../controllers/project.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkFga } from '../middleware/authz.middleware';

const router = Router();

router.use(authenticate);

// createProject does not require checkFga because "Any authenticated user can create a project."
router.post('/', createProject);
router.get('/', listProjects); // listProjects filters via listObjects internally

// assigning a user requires 'owner' or 'editor' access (usually only owner, let's say owner)
router.post('/:projectId/assign', checkFga('project', req => req.params.projectId as string, 'owner'), assignUser);

export default router;
