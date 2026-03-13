"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const authz_middleware_1 = require("../middleware/authz.middleware");
const router = (0, express_1.Router)();
router.post('/register', auth_controller_1.register);
router.post('/login', auth_controller_1.login);
router.post('/users', auth_middleware_1.authenticate, (0, authz_middleware_1.checkFga)('system', () => 'global', 'admin'), auth_controller_1.createUser);
router.get('/users', auth_middleware_1.authenticate, auth_controller_1.listUsers);
router.put('/users/:id/role', auth_middleware_1.authenticate, (0, authz_middleware_1.checkFga)('system', () => 'global', 'admin'), auth_controller_1.updateUserRole);
router.delete('/users/:id', auth_middleware_1.authenticate, (0, authz_middleware_1.checkFga)('system', () => 'global', 'admin'), auth_controller_1.deleteUser);
router.get('/me', auth_middleware_1.authenticate, auth_controller_1.getMe);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map