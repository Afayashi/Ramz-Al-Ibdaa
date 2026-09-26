import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Correlation id + structured access log; never logs bodies (PII) or auth headers
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private log = new Logger('HTTP');
  use(req: Request, res: Response, next: NextFunction) {
    const id = (req.headers['x-request-id'] as string) || randomUUID();
    (req as any).id = id;
    res.setHeader('x-request-id', id);
    const t = Date.now();
    res.on('finish', () => {
      const line = JSON.stringify({ id, m: req.method, p: req.originalUrl.split('?')[0], s: res.statusCode, ms: Date.now() - t, u: (req as any).user?.sub });
      res.statusCode >= 500 ? this.log.error(line) : this.log.log(line);
    });
    next();
  }
}
