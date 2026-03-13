import { Request, Response, NextFunction } from 'express';
export declare const checkFga: (objectType: string, getObjectId: (req: Request) => string, relation: string) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=authz.middleware.d.ts.map