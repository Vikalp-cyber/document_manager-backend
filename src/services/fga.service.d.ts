import { OpenFgaClient } from '@openfga/sdk';
declare class FgaService {
    client: OpenFgaClient;
    storeId?: string;
    authorizationModelId?: string;
    constructor();
    private initClient;
    initialize(): Promise<void>;
    writeTuple(user: string, relation: string, object: string): Promise<void>;
    deleteTuple(user: string, relation: string, object: string): Promise<void>;
    check(user: string, relation: string, object: string): Promise<boolean>;
}
export declare const fgaService: FgaService;
export {};
//# sourceMappingURL=fga.service.d.ts.map