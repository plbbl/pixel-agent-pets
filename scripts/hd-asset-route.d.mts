export const hdRoute: string;
export const inject: string[];
export function assetHandler(root?: string): Promise<(req: any, res: any) => Promise<void>>;
export function apply(ctx: any): Promise<() => void>;
