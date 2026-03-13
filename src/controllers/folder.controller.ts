import { Request, Response } from 'express';
import { pool } from '../db';
import { fgaService } from '../services/fga.service';

export const createFolder = async (req: Request, res: Response): Promise<void> => {
    const { name, projectId, parentFolderId } = req.body;
    if (!name || !projectId) {
        res.status(400).json({ error: 'Name and projectId are required' });
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'INSERT INTO folders (name, project_id, parent_folder_id, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, projectId, parentFolderId || null, req.user?.userId]
        );
        const newFolder = result.rows[0];

        // Write FGA tuples linking folder to its parent
        await fgaService.writeTuple(
            `project:${projectId}`,
            'parent_project',
            `folder:${newFolder.id}`
        );

        if (req.user?.userId) {
            await fgaService.writeTuple(
                `user:${req.user.userId}`,
                'owner',
                `folder:${newFolder.id}`
            );
        }

        if (parentFolderId) {
            await fgaService.writeTuple(
                `folder:${parentFolderId}`,
                'parent_folder',
                `folder:${newFolder.id}`
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ folder: newFolder });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in createFolder:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
};

export const listFolders = async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const { parentFolderId } = req.query;

    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // List folders user can 'view'
        const { objects } = await fgaService.client.listObjects({
            user: `user:${userId}`,
            relation: 'view',
            type: 'folder'
        });

        if (!objects || objects.length === 0) {
            res.json({ folders: [] });
            return;
        }

        const folderIds = objects.map((id: string) => id.replace('folder:', ''));

        let query = 'SELECT * FROM folders WHERE project_id = $1 AND id = ANY($2::uuid[])';
        const params: any[] = [projectId, folderIds];

        if (parentFolderId) {
            query += ' AND parent_folder_id = $3';
            params.push(parentFolderId);
        } else {
            query += ' AND parent_folder_id IS NULL';
        }

        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, params);
        res.json({ folders: result.rows });
    } catch (err) {
        console.error('Error in listFolders:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const assignFolderUser = async (req: Request, res: Response): Promise<void> => {
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
        await fgaService.writeTuple(`user:${userId}`, relation, `folder:${folderId}`);
        res.status(200).json({ message: `User assigned as ${relation} successfully` });
    } catch (err) {
        console.error('Error in assignFolderUser:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
