"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDocument = exports.downloadDocument = exports.assignDocumentUser = exports.listDocuments = exports.uploadDocument = exports.logAudit = void 0;
const db_1 = require("../db");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const fga_service_1 = require("../services/fga.service");
const logAudit = async (userId, documentId, action, client) => {
    try {
        const db = client || db_1.pool;
        await db.query('INSERT INTO audit_logs (user_id, document_id, action) VALUES ($1, $2, $3)', [userId, documentId, action]);
    }
    catch (err) {
        console.error('Failed to write audit log:', err);
    }
};
exports.logAudit = logAudit;
const uploadDocument = async (req, res) => {
    const { projectId } = req.params;
    const { folderId } = req.body;
    // Extract parallel array of paths (e.g. ['A/B/file.pdf', 'A/file2.pdf']) if provided
    let paths = [];
    if (req.body.paths) {
        if (Array.isArray(req.body.paths)) {
            paths = req.body.paths;
        }
        else {
            paths = [req.body.paths];
        }
    }
    const files = req.files;
    if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files uploaded or invalid file type' });
        return;
    }
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        // Caching folder paths we create/find during this upload to avoid duplicate DB calls
        const folderCache = new Map();
        const getOrCreateFolder = async (pathStr, baseFolderId) => {
            if (!pathStr || pathStr.indexOf('/') === -1)
                return baseFolderId; // Just a file, no dir prepended
            const parts = pathStr.split('/');
            parts.pop(); // Remove the filename
            let currentParentId = baseFolderId;
            let currentPath = '';
            for (const folderName of parts) {
                currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
                const cacheKey = `${currentParentId || 'root'}:${folderName}`;
                if (folderCache.has(cacheKey)) {
                    currentParentId = folderCache.get(cacheKey);
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
                    folderCache.set(cacheKey, currentParentId);
                }
                else {
                    // Create it
                    const result = await client.query('INSERT INTO folders (name, project_id, parent_folder_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [folderName, projectId, currentParentId || null, req.user?.userId]);
                    const newFolderId = result.rows[0].id;
                    // FGA Tuples
                    await fga_service_1.fgaService.writeTuple(`project:${projectId}`, 'parent_project', `folder:${newFolderId}`);
                    if (currentParentId) {
                        await fga_service_1.fgaService.writeTuple(`folder:${currentParentId}`, 'parent_folder', `folder:${newFolderId}`);
                    }
                    currentParentId = newFolderId;
                    folderCache.set(cacheKey, currentParentId);
                }
            }
            return currentParentId;
        };
        const newDocs = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file)
                continue;
            const filePathStr = paths[i] || '';
            const targetFolderId = await getOrCreateFolder(filePathStr, folderId || null);
            // Insert document
            const result = await client.query(`INSERT INTO documents (project_id, folder_id, original_name, file_name, file_path, file_size, file_type, uploaded_by) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [projectId, targetFolderId || null, file.originalname, file.filename, file.path, file.size, file.mimetype, req.user?.userId]);
            const newDoc = result.rows[0];
            newDocs.push(newDoc);
            // Write FGA tuple linking document to its project parent
            await fga_service_1.fgaService.writeTuple(`project:${projectId}`, 'parent_project', `document:${newDoc.id}`);
            // Give the uploader 'owner' permissions explicitly
            if (req.user?.userId) {
                await fga_service_1.fgaService.writeTuple(`user:${req.user.userId}`, 'owner', `document:${newDoc.id}`);
            }
            if (targetFolderId) {
                await fga_service_1.fgaService.writeTuple(`folder:${targetFolderId}`, 'parent_folder', `document:${newDoc.id}`);
            }
            // Audit log
            await (0, exports.logAudit)(req.user.userId, newDoc.id, 'upload', client);
        }
        await client.query('COMMIT');
        res.status(201).json({ documents: newDocs });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in uploadDocument:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.uploadDocument = uploadDocument;
const listDocuments = async (req, res) => {
    const { projectId } = req.params;
    const { folderId } = req.query;
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        // List all documents the user can 'view'
        const { objects } = await fga_service_1.fgaService.client.listObjects({
            user: `user:${userId}`,
            relation: 'view',
            type: 'document'
        });
        if (!objects || objects.length === 0) {
            res.json({ documents: [] });
            return;
        }
        const docIds = objects.map((id) => id.replace('document:', ''));
        let query = 'SELECT * FROM documents WHERE project_id = $1 AND id = ANY($2::uuid[])';
        const params = [projectId, docIds];
        if (folderId) {
            query += ' AND folder_id = $3';
            params.push(folderId);
        }
        else {
            query += ' AND folder_id IS NULL';
        }
        query += ' ORDER BY created_at DESC';
        const result = await db_1.pool.query(query, params);
        res.json({ documents: result.rows });
    }
    catch (err) {
        console.error('Error in listDocuments:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.listDocuments = listDocuments;
const assignDocumentUser = async (req, res) => {
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
        await fga_service_1.fgaService.writeTuple(`user:${userId}`, relation, `document:${documentId}`);
        res.status(200).json({ message: `User assigned as ${relation} successfully` });
    }
    catch (err) {
        console.error('Error in assignDocumentUser:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.assignDocumentUser = assignDocumentUser;
const downloadDocument = async (req, res) => {
    const { documentId } = req.params;
    try {
        const result = await db_1.pool.query('SELECT * FROM documents WHERE id = $1', [documentId]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }
        const doc = result.rows[0];
        // Authorization check is now handled by middleware. We can omit the RBAC manual check here.
        // Path traversal prevention: verify the file is within our storage
        const storageDir = path_1.default.resolve(__dirname, '../../storage/projects');
        const absolutePath = path_1.default.resolve(doc.file_path);
        if (!absolutePath.startsWith(storageDir)) {
            res.status(400).json({ error: 'Invalid file path' });
            return;
        }
        if (!fs_1.default.existsSync(absolutePath)) {
            res.status(404).json({ error: 'File physically missing on server' });
            return;
        }
        await (0, exports.logAudit)(req.user.userId, doc.id, 'download');
        res.download(absolutePath, doc.original_name);
    }
    catch (err) {
        console.error('Error in downloadDocument:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.downloadDocument = downloadDocument;
const deleteDocument = async (req, res) => {
    const { documentId } = req.params;
    const client = await db_1.pool.connect();
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
        const storageDir = path_1.default.resolve(__dirname, '../../storage/projects');
        const absolutePath = path_1.default.resolve(doc.file_path);
        if (absolutePath.startsWith(storageDir) && fs_1.default.existsSync(absolutePath)) {
            fs_1.default.unlinkSync(absolutePath);
        }
        await client.query('DELETE FROM documents WHERE id = $1', [documentId]);
        await (0, exports.logAudit)(req.user.userId, doc.id, 'delete', client);
        await client.query('COMMIT');
        res.json({ message: 'Document deleted successfully' });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in deleteDocument:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.deleteDocument = deleteDocument;
//# sourceMappingURL=document.controller.js.map