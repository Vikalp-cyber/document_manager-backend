"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignFolderUser = exports.listFolders = exports.createFolder = void 0;
const db_1 = require("../db");
const fga_service_1 = require("../services/fga.service");
const createFolder = async (req, res) => {
    const { name, projectId, parentFolderId } = req.body;
    if (!name || !projectId) {
        res.status(400).json({ error: 'Name and projectId are required' });
        return;
    }
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query('INSERT INTO folders (name, project_id, parent_folder_id, created_by) VALUES ($1, $2, $3, $4) RETURNING *', [name, projectId, parentFolderId || null, req.user?.userId]);
        const newFolder = result.rows[0];
        // Write FGA tuples linking folder to its parent
        await fga_service_1.fgaService.writeTuple(`project:${projectId}`, 'parent_project', `folder:${newFolder.id}`);
        if (req.user?.userId) {
            await fga_service_1.fgaService.writeTuple(`user:${req.user.userId}`, 'owner', `folder:${newFolder.id}`);
        }
        if (parentFolderId) {
            await fga_service_1.fgaService.writeTuple(`folder:${parentFolderId}`, 'parent_folder', `folder:${newFolder.id}`);
        }
        await client.query('COMMIT');
        res.status(201).json({ folder: newFolder });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in createFolder:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.createFolder = createFolder;
const listFolders = async (req, res) => {
    const { projectId } = req.params;
    const { parentFolderId } = req.query;
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        // List folders user can 'view'
        const { objects } = await fga_service_1.fgaService.client.listObjects({
            user: `user:${userId}`,
            relation: 'view',
            type: 'folder'
        });
        if (!objects || objects.length === 0) {
            res.json({ folders: [] });
            return;
        }
        const folderIds = objects.map((id) => id.replace('folder:', ''));
        let query = 'SELECT * FROM folders WHERE project_id = $1 AND id = ANY($2::uuid[])';
        const params = [projectId, folderIds];
        if (parentFolderId) {
            query += ' AND parent_folder_id = $3';
            params.push(parentFolderId);
        }
        else {
            query += ' AND parent_folder_id IS NULL';
        }
        query += ' ORDER BY created_at DESC';
        const result = await db_1.pool.query(query, params);
        res.json({ folders: result.rows });
    }
    catch (err) {
        console.error('Error in listFolders:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.listFolders = listFolders;
const assignFolderUser = async (req, res) => {
    const { folderId } = req.params;
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
        await fga_service_1.fgaService.writeTuple(`user:${userId}`, relation, `folder:${folderId}`);
        res.status(200).json({ message: `User assigned as ${relation} successfully` });
    }
    catch (err) {
        console.error('Error in assignFolderUser:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.assignFolderUser = assignFolderUser;
//# sourceMappingURL=folder.controller.js.map