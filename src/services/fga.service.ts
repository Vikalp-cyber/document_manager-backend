import { OpenFgaClient } from '@openfga/sdk';
import fs from 'fs';
import path from 'path';

const FGA_API_URL = process.env.FGA_API_URL || 'http://localhost:8080';

class FgaService {
    public client!: OpenFgaClient;
    public storeId?: string;
    public authorizationModelId?: string;

    constructor() {
        this.initClient();
    }

    private initClient(storeId?: string) {
        this.client = new OpenFgaClient({
            apiScheme: FGA_API_URL.startsWith('https') ? 'https' : 'http',
            apiHost: FGA_API_URL.replace(/^https?:\/\//, ''),
            ...(storeId ? { storeId } : {}),
        });
    }

    async initialize() {
        try {
            console.log('Initializing OpenFGA connection to:', FGA_API_URL);

            // Wait for FGA to be ready as it might be starting up alongside our backend
            let retries = 5;
            while (retries > 0) {
                try {
                    // 1. Find or create store
                    const { stores } = await this.client.listStores();
                    let store = stores?.find(s => s.name === 'document_manager');

                    if (!store) {
                        store = await this.client.createStore({ name: 'document_manager' });
                        console.log('Created OpenFGA store:', store.id);
                    } else {
                        console.log('Found existing OpenFGA store:', store.id);
                    }

                    this.storeId = store.id;
                    this.initClient(this.storeId);
                    break; // Successfully connected and found/created store
                } catch (e) {
                    console.log(`Failed to connect to OpenFGA, retrying... (${retries} left)`);
                    await new Promise(r => setTimeout(r, 2000));
                    retries--;
                }
            }

            if (!this.storeId) {
                throw new Error('Could not connect to OpenFGA after multiple retries.');
            }

            // 2. Write Authorization Model
            const modelJsonPath = path.resolve(__dirname, '../config/openfga.model.json');
            const modelData = JSON.parse(fs.readFileSync(modelJsonPath, 'utf-8'));

            // Check existing models
            const { authorization_models } = await this.client.readAuthorizationModels();

            // We will write the model if it's not present (ignoring idempotency for simplicity of dev)
            if (!authorization_models || authorization_models.length === 0) {
                const { authorization_model_id } = await this.client.writeAuthorizationModel(modelData);
                this.authorizationModelId = authorization_model_id;
                console.log('Written new authorization model:', this.authorizationModelId);
            } else {
                // Find the latest model or use the first one
                if (authorization_models[0]?.id) {
                    this.authorizationModelId = authorization_models[0].id;
                    console.log('Using existing authorization model:', this.authorizationModelId);
                }
            }

            // Ensure the client has the authorization model id set 
            this.client = new OpenFgaClient({
                apiScheme: FGA_API_URL.startsWith('https') ? 'https' : 'http',
                apiHost: FGA_API_URL.replace(/^https?:\/\//, ''),
                storeId: this.storeId as string,
                ...(this.authorizationModelId ? { authorizationModelId: this.authorizationModelId } : {})
            });

        } catch (err) {
            console.error('Error initializing OpenFGA:', err);
            throw err;
        }
    }

    async writeTuple(user: string, relation: string, object: string) {
        await this.client.write({
            writes: [{ user, relation, object }]
        });
    }

    async deleteTuple(user: string, relation: string, object: string) {
        await this.client.write({
            deletes: [{ user, relation, object }]
        });
    }

    async check(user: string, relation: string, object: string): Promise<boolean> {
        const { allowed } = await this.client.check({
            user,
            relation,
            object,
        });
        return allowed ?? false;
    }
}

export const fgaService = new FgaService();
