import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt';

declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload;
        }
    }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
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
        const payload = verifyToken(token);
        req.user = payload;
        next();
    } catch (err) {
        res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
};

export const authorizeRoles = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
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
