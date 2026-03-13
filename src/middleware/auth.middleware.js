"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRoles = exports.authenticate = void 0;
const jwt_1 = require("../utils/jwt");
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: No token provided' });
        return;
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'Unauthorized: Malformed token' });
        return;
    }
    try {
        const payload = (0, jwt_1.verifyToken)(token);
        req.user = payload;
        next();
    }
    catch (err) {
        res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
};
exports.authenticate = authenticate;
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
            return;
        }
        next();
    };
};
exports.authorizeRoles = authorizeRoles;
//# sourceMappingURL=auth.middleware.js.map