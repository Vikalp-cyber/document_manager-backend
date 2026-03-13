"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fgaService = void 0;
const sdk_1 = require("@openfga/sdk");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const FGA_API_URL = process.env.FGA_API_URL || 'http://localhost:8080';
class FgaService {
    client;
    storeId;
    authorizationModelId;
    constructor() {
        this.initClient();
    }
    initClient(storeId) {
        this.client = new sdk_1.OpenFgaClient({
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
                    }
                    else {
                        console.log('Found existing OpenFGA store:', store.id);
                    }
                    this.storeId = store.id;
                    this.initClient(this.storeId);
                    break; // Successfully connected and found/created store
                }
                catch (e) {
                    console.log(`Failed to connect to OpenFGA, retrying... (${retries} left)`);
                    await new Promise(r => setTimeout(r, 2000));
                    retries--;
                }
            }
            if (!this.storeId) {
                throw new Error('Could not connect to OpenFGA after multiple retries.');
            }
            // 2. Write Authorization Model
            const modelJsonPath = path_1.default.resolve(__dirname, '../config/openfga.model.json');
            const modelData = JSON.parse(fs_1.default.readFileSync(modelJsonPath, 'utf-8'));
            // Check existing models
            const { authorization_models } = await this.client.readAuthorizationModels();
            // We will write the model if it's not present (ignoring idempotency for simplicity of dev)
            if (!authorization_models || authorization_models.length === 0) {
                const { authorization_model_id } = await this.client.writeAuthorizationModel(modelData);
                this.authorizationModelId = authorization_model_id;
                console.log('Written new authorization model:', this.authorizationModelId);
            }
            else {
                // Find the latest model or use the first one
                if (authorization_models[0]?.id) {
                    this.authorizationModelId = authorization_models[0].id;
                    console.log('Using existing authorization model:', this.authorizationModelId);
                }
            }
            // Ensure the client has the authorization model id set 
            this.client = new sdk_1.OpenFgaClient({
                apiScheme: FGA_API_URL.startsWith('https') ? 'https' : 'http',
                apiHost: FGA_API_URL.replace(/^https?:\/\//, ''),
                storeId: this.storeId,
                ...(this.authorizationModelId ? { authorizationModelId: this.authorizationModelId } : {})
            });
        }
        catch (err) {
            console.error('Error initializing OpenFGA:', err);
            throw err;
        }
    }
    async writeTuple(user, relation, object) {
        await this.client.write({
            writes: [{ user, relation, object }]
        });
    }
    async deleteTuple(user, relation, object) {
        await this.client.write({
            deletes: [{ user, relation, object }]
        });
    }
    async check(user, relation, object) {
        const { allowed } = await this.client.check({
            user,
            relation,
            object,
        });
        return allowed ?? false;
    }
}
exports.fgaService = new FgaService();
//# sourceMappingURL=fga.service.js.map