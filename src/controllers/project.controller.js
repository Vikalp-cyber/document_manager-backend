"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignUser = exports.listProjects = exports.createProject = void 0;
const db_1 = require("../db");
const fga_service_1 = require("../services/fga.service");
const createProject = async (req, res) => {
    const { project_name, description } = req.body;
    if (!project_name) {
        res.status(400).json({ error: 'Project name is required' });
        return;
    }
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query('INSERT INTO projects (project_name, description, created_by) VALUES ($1, $2, $3) RETURNING *', [project_name, description, req.user?.userId]);
        const newProject = result.rows[0];
        // Write OpenFGA tuple: creator is owner of the project
        if (req.user?.userId) {
            await fga_service_1.fgaService.writeTuple(`user:${req.user.userId}`, 'owner', `project:${newProject.id}`);
        }
        // Write OpenFGA tuple: Link project to global system
        await fga_service_1.fgaService.writeTuple('system:global', 'parent_system', `project:${newProject.id}`);
        await client.query('COMMIT');
        res.status(201).json({ project: newProject });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in createProject:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.createProject = createProject;
const listProjects = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        // Use OpenFGA to find ALL items this user can 'view'
        const [projectObjects, folderObjects, docObjects] = await Promise.all([
            fga_service_1.fgaService.client.listObjects({ user: `user:${userId}`, relation: 'view', type: 'project' }),
            fga_service_1.fgaService.client.listObjects({ user: `user:${userId}`, relation: 'view', type: 'folder' }),
            fga_service_1.fgaService.client.listObjects({ user: `user:${userId}`, relation: 'view', type: 'document' })
        ]);
        const projectIds = projectObjects.objects ? projectObjects.objects.map((id) => id.replace('project:', '')) : [];
        const folderIds = folderObjects.objects ? folderObjects.objects.map((id) => id.replace('folder:', '')) : [];
        const docIds = docObjects.objects ? docObjects.objects.map((id) => id.replace('document:', '')) : [];
        if (projectIds.length === 0 && folderIds.length === 0 && docIds.length === 0) {
            res.json({ projects: [] });
            return;
        }
        // Use ANY array operator for postgres
        const result = await db_1.pool.query(`SELECT * FROM projects 
             WHERE id = ANY($1::uuid[]) 
             OR id IN (SELECT project_id FROM folders WHERE id = ANY($2::uuid[]))
             OR id IN (SELECT project_id FROM documents WHERE id = ANY($3::uuid[]))
             ORDER BY created_at DESC`, [projectIds, folderIds, docIds]);
        res.json({ projects: result.rows });
    }
    catch (err) {
        console.error('Error in listProjects:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.listProjects = listProjects;
const assignUser = async (req, res) => {
    const { projectId } = req.params;
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
        await fga_service_1.fgaService.writeTuple(`user:${userId}`, relation, `project:${projectId}`);
        res.status(200).json({ message: `User assigned as ${relation} successfully` });
    }
    catch (err) {
        console.error('Error in assignUser:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.assignUser = assignUser;
//# sourceMappingURL=project.controller.js.map