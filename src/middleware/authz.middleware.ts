import { Request, Response, NextFunction } from 'express';
import { fgaService } from '../services/fga.service';

export const checkFga = (objectType: string, getObjectId: (req: Request) => string, relation: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user || !req.user.userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const userStr = `user:${req.user.userId}`;
            const objectId = getObjectId(req);

            // If there's no object ID (e.g., creating a new project), we can't check against a specific object
            // Usually creation is allowed for all authenticated users if there's no global "can_create_project" permission.
            // The requirement says "Any authenticated user can create a project."
            if (!objectId) {
                next();
                return;
            }

            const objectStr = `${objectType}:${objectId}`;

            const isAllowed = await fgaService.check(userStr, relation, objectStr);

            if (!isAllowed) {
                res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
                return;
            }

            next();
        } catch (err) {
            console.error('FGA Check Error:', err);
            res.status(500).json({ error: 'Authorization check failed' });
        }
    };
};
