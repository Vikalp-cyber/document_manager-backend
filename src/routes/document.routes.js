"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const document_controller_1 = require("../controllers/document.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const authz_middleware_1 = require("../middleware/authz.middleware");
const upload_middleware_1 = require("../middleware/upload.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// Custom permission check
const checkDocumentCreateAccess = async (req, res, next) => {
    const folderId = req.body?.folderId;
    const projectId = req.params?.projectId;
    if (folderId) {
        (0, authz_middleware_1.checkFga)('folder', () => folderId, 'create_document')(req, res, next);
    }
    else {
        (0, authz_middleware_1.checkFga)('project', () => projectId, 'create_document')(req, res, next);
    }
};
// Uploading requires 'create_document' permission on the project or folder
router.post('/projects/:projectId/documents', checkDocumentCreateAccess, upload_middleware_1.upload.array('files'), document_controller_1.uploadDocument);
// Listing filters documents internally based on 'view' relation
router.get('/projects/:projectId/documents', document_controller_1.listDocuments);
// Global routes for documents with ID
// Downloading requires 'view' permission on the document itself
router.get('/documents/:documentId/download', (0, authz_middleware_1.checkFga)('document', req => req.params.documentId, 'view'), document_controller_1.downloadDocument);
// Deleting requires 'delete' permission on the document itself
router.delete('/documents/:documentId', (0, authz_middleware_1.checkFga)('document', req => req.params.documentId, 'delete'), document_controller_1.deleteDocument);
// Assigning permissions to a specific document requires owner
router.post('/documents/:documentId/assign', (0, authz_middleware_1.checkFga)('document', req => req.params.documentId, 'owner'), document_controller_1.assignDocumentUser);
exports.default = router;
//# sourceMappingURL=document.routes.js.map