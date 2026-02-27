import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.js";

export function requireRole(...roles: Array<"admin" | "praticien" | "assistant">) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!roles.includes(role as "admin" | "praticien" | "assistant")) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}
