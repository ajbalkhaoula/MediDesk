import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: string; cabinetId: string | null; email: string };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      sub: string;
      role: string;
      cabinetId: string | null;
      email: string;
    };

    req.user = {
      id: payload.sub,
      role: payload.role,
      cabinetId: payload.cabinetId,
      email: payload.email,
    };

    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
