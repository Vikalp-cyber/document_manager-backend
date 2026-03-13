import { Request, Response } from 'express';
export declare const logAudit: (userId: string, documentId: string, action: string, client?: any) => Promise<void>;
export declare const uploadDocument: (req: Request, res: Response) => Promise<void>;
export declare const listDocuments: (req: Request, res: Response) => Promise<void>;
export declare const assignDocumentUser: (req: Request, res: Response) => Promise<void>;
export declare const downloadDocument: (req: Request, res: Response) => Promise<void>;
export declare const deleteDocument: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=document.controller.d.ts.map