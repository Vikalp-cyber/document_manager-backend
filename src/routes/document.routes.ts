import { Router } from 'express';
import { uploadDocument, listDocuments, downloadDocument, deleteDocument, assignDocumentUser } from '../controllers/document.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkFga } from '../middleware/authz.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.use(authenticate);

import { NextFunction, RequestHandler } from 'express';

// Custom permission check
const checkDocumentCreateAccess: RequestHandler = async (req, res, next) => {
    const folderId = req.body?.folderId;
    const projectId = req.params?.projectId;

    if (folderId) {
        checkFga('folder', () => folderId, 'create_document')(req, res, next);
    } else {
        checkFga('project', () => projectId as string, 'create_document')(req, res, next);
    }
};

// Uploading requires 'create_document' permission on the project or folder
router.post('/projects/:projectId/documents',
    checkDocumentCreateAccess,
    upload.array('files'),
    uploadDocument
);

// Listing filters documents internally based on 'view' relation
router.get('/projects/:projectId/documents',
    listDocuments
);

// Global routes for documents with ID
// Downloading requires 'view' permission on the document itself
router.get('/documents/:documentId/download',
    checkFga('document', req => req.params.documentId as string, 'view'),
    downloadDocument
);

// Deleting requires 'delete' permission on the document itself
router.delete('/documents/:documentId',
    checkFga('document', req => req.params.documentId as string, 'delete'),
    deleteDocument
);

// Assigning permissions to a specific document requires owner
router.post('/documents/:documentId/assign',
    checkFga('document', req => req.params.documentId as string, 'owner'),
    assignDocumentUser
);

export default router;
