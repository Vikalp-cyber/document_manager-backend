import { Router, Request, Response, NextFunction } from 'express';
import { createFolder, listFolders, assignFolderUser } from '../controllers/folder.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkFga } from '../middleware/authz.middleware';

const router = Router();

router.use(authenticate);

// Custom middleware to check create permissions based on payload
const checkFolderCreateAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { projectId, parentFolderId } = req.body;

    if (parentFolderId) {
        return checkFga('folder', () => parentFolderId, 'create_document')(req, res, next);
    } else if (projectId) {
        return checkFga('project', () => projectId, 'create_document')(req, res, next);
    } else {
        res.status(400).json({ error: 'Missing projectId' });
        return;
    }
};

router.post('/folders', checkFolderCreateAccess, createFolder);

// Listing folders filters internally
router.get('/projects/:projectId/folders',
    listFolders
);

// Assigning permissions to a specific folder requires owner of that folder
router.post('/folders/:folderId/assign',
    checkFga('folder', req => req.params.folderId as string, 'owner'),
    assignFolderUser
);

export default router;
