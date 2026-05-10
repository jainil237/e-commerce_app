import { Request, Response, NextFunction } from 'express';
export interface ApiError extends Error {
    statusCode?: number;
    code?: string;
}
export declare const errorHandler: (err: ApiError, req: Request, res: Response, _next: NextFunction) => void;
export declare const notFound: (req: Request, res: Response, next: NextFunction) => void;
export declare const createError: (statusCode: number, message: string, code?: string) => ApiError;
//# sourceMappingURL=error.middleware.d.ts.map