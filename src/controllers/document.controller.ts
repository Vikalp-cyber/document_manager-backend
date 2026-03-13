import { Request, Response } from 'express';
import { pool } from '../db';
import path from 'path';
import fs from 'fs';
import { fgaService } from '../services/fga.service';

export const logAudit = async (userId: string, documentId: string, action: string, client?: any) => {
    try {
        const db = client || pool;
        await db.query('INSERT INTO audit_logs (user_id, document_id, action) VALUES ($1, $2, $3)', [userId, documentId, action]);
    } catch (err) {
        console.error('Failed to write audit log:', err);
    }
};

export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const { folderId } = req.body;

    // Extract parallel array of paths (e.g. ['A/B/file.pdf', 'A/file2.pdf']) if provided
    let paths: string[] = [];
    if (req.body.paths) {
        if (Array.isArray(req.body.paths)) {
            paths = req.body.paths;
        } else {
            paths = [req.body.paths];
        }
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files uploaded or invalid file type' });
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Caching folder paths we create/find during this upload to avoid duplicate DB calls
        const folderCache = new Map<string, string>();

        const getOrCreateFolder = async (pathStr: string, baseFolderId: string | null): Promise<string | null> => {
            if (!pathStr || pathStr.indexOf('/') === -1) return baseFolderId; // Just a file, no dir prepended

            const parts = pathStr.split('/');
            parts.pop(); // Remove the filename

            let currentParentId = baseFolderId;
            let currentPath = '';

            for (const folderName of parts) {
                currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
                const cacheKey = `${currentParentId || 'root'}:${folderName}`;

                if (folderCache.has(cacheKey)) {
                    currentParentId = folderCache.get(cacheKey)!;
                    continue;
                }

                // Check DB
                const queryStr = currentParentId
                    ? 'SELECT id FROM folders WHERE project_id = $1 AND parent_folder_id = $2 AND name = $3'
                    : 'SELECT id FROM folders WHERE project_id = $1 AND parent_folder_id IS NULL AND name = $2';

                const params = currentParentId ? [projectId, currentParentId, folderName] : [projectId, folderName];

                const existing = await client.query(queryStr, params);

                if (existing.rows.length > 0) {
                    currentParentId = existing.rows[0].id;
                    folderCache.set(cacheKey, currentParentId as string);
                } else {
                    // Create it
                    const result = await client.query(
                        'INSERT INTO folders (name, project_id, parent_folder_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
                        [folderName, projectId, currentParentId || null, req.user?.userId]
                    );
                    const newFolderId = result.rows[0].id;

                    // FGA Tuples
                    await fgaService.writeTuple(`project:${projectId}`, 'parent_project', `folder:${newFolderId}`);
                    if (currentParentId) {
                        await fgaService.writeTuple(`folder:${currentParentId}`, 'parent_folder', `folder:${newFolderId}`);
                    }

                    currentParentId = newFolderId;
                    folderCache.set(cacheKey, currentParentId as string);
                }
            }
            return currentParentId;
        };

        const newDocs = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file) continue;

            const filePathStr = paths[i] || '';
            const targetFolderId = await getOrCreateFolder(filePathStr, folderId || null);

            // Insert document
            const result = await client.query(
                `INSERT INTO documents (project_id, folder_id, original_name, file_name, file_path, file_size, file_type, uploaded_by) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [projectId, targetFolderId || null, file.originalname, file.filename, file.path, file.size, file.mimetype, req.user?.userId]
            );

            const newDoc = result.rows[0];
            newDocs.push(newDoc);

            // Write FGA tuple linking document to its project parent
            await fgaService.writeTuple(
                `project:${projectId}`,
                'parent_project',
                `document:${newDoc.id}`
            );

            // Give the uploader 'owner' permissions explicitly
            if (req.user?.userId) {
                await fgaService.writeTuple(
                    `user:${req.user.userId}`,
                    'owner',
                    `document:${newDoc.id}`
                );
            }

            if (targetFolderId) {
                await fgaService.writeTuple(
                    `folder:${targetFolderId}`,
                    'parent_folder',
                    `document:${newDoc.id}`
                );
            }

            // Audit log
            await logAudit(req.user!.userId, newDoc.id, 'upload', client);
        }

        await client.query('COMMIT');
        res.status(201).json({ documents: newDocs });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in uploadDocument:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
};

export const listDocuments = async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const { folderId } = req.query;

    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // List all documents the user can 'view'
        const { objects } = await fgaService.client.listObjects({
            user: `user:${userId}`,
            relation: 'view',
            type: 'document'
        });

        if (!objects || objects.length === 0) {
            res.json({ documents: [] });
            return;
        }

        const docIds = objects.map((id: string) => id.replace('document:', ''));

        let query = 'SELECT * FROM documents WHERE project_id = $1 AND id = ANY($2::uuid[])';
        const params: any[] = [projectId, docIds];

        if (folderId) {
            query += ' AND folder_id = $3';
            params.push(folderId);
        } else {
            query += ' AND folder_id IS NULL';
        }

        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, params);
        res.json({ documents: result.rows });
    } catch (err) {
        console.error('Error in listDocuments:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const assignDocumentUser = async (req: Request, res: Response): Promise<void> => {
    const { documentId } = req.params;
    const { userId, relation = 'viewer' } = req.body;

    if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
    }

    const validRelations = ['owner', 'editor', 'viewer'];
    if (!validRelations.includes(relation)) {
        res.status(400).json({ error: 'Invalid relation type' });
        return;
    }

    try {
        await fgaService.writeTuple(`user:${userId}`, relation, `document:${documentId}`);
        res.status(200).json({ message: `User assigned as ${relation} successfully` });
    } catch (err) {
        console.error('Error in assignDocumentUser:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const downloadDocument = async (req: Request, res: Response): Promise<void> => {
    const { documentId } = req.params;

    try {
        const result = await pool.query('SELECT * FROM documents WHERE id = $1', [documentId]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        const doc = result.rows[0];

        // Authorization check is now handled by middleware. We can omit the RBAC manual check here.


        // Path traversal prevention: verify the file is within our storage
        const storageDir = path.resolve(__dirname, '../../storage/projects');
        const absolutePath = path.resolve(doc.file_path);

        if (!absolutePath.startsWith(storageDir)) {
            res.status(400).json({ error: 'Invalid file path' });
            return;
        }

        if (!fs.existsSync(absolutePath)) {
            res.status(404).json({ error: 'File physically missing on server' });
            return;
        }

        await logAudit(req.user!.userId, doc.id, 'download');

        res.download(absolutePath, doc.original_name);
    } catch (err) {
        console.error('Error in downloadDocument:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
    const { documentId } = req.params;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query('SELECT * FROM documents WHERE id = $1', [documentId]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        const doc = result.rows[0];

        // Authorization is handled by middleware

        // Attempt to delete physically
        const storageDir = path.resolve(__dirname, '../../storage/projects');
        const absolutePath = path.resolve(doc.file_path);

        if (absolutePath.startsWith(storageDir) && fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
        }

        await client.query('DELETE FROM documents WHERE id = $1', [documentId]);
        await logAudit(req.user!.userId, doc.id, 'delete', client);

        await client.query('COMMIT');
        res.json({ message: 'Document deleted successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in deleteDocument:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
};
