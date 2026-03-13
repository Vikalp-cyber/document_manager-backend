"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const folder_controller_1 = require("../controllers/folder.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const authz_middleware_1 = require("../middleware/authz.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// Custom middleware to check create permissions based on payload
const checkFolderCreateAccess = async (req, res, next) => {
    const { projectId, parentFolderId } = req.body;
    if (parentFolderId) {
        return (0, authz_middleware_1.checkFga)('folder', () => parentFolderId, 'create_document')(req, res, next);
    }
    else if (projectId) {
        return (0, authz_middleware_1.checkFga)('project', () => projectId, 'create_document')(req, res, next);
    }
    else {
        res.status(400).json({ error: 'Missing projectId' });
        return;
    }
};
router.post('/folders', checkFolderCreateAccess, folder_controller_1.createFolder);
// Listing folders filters internally
router.get('/projects/:projectId/folders', folder_controller_1.listFolders);
// Assigning permissions to a specific folder requires owner of that folder
router.post('/folders/:folderId/assign', (0, authz_middleware_1.checkFga)('folder', req => req.params.folderId, 'owner'), folder_controller_1.assignFolderUser);
exports.default = router;
//# sourceMappingURL=folder.routes.js.map