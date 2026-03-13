"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const project_controller_1 = require("../controllers/project.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const authz_middleware_1 = require("../middleware/authz.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// createProject does not require checkFga because "Any authenticated user can create a project."
router.post('/', project_controller_1.createProject);
router.get('/', project_controller_1.listProjects); // listProjects filters via listObjects internally
// assigning a user requires 'owner' or 'editor' access (usually only owner, let's say owner)
router.post('/:projectId/assign', (0, authz_middleware_1.checkFga)('project', req => req.params.projectId, 'owner'), project_controller_1.assignUser);
exports.default = router;
//# sourceMappingURL=project.routes.js.map