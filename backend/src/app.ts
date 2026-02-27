import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { patientsRouter } from "./routes/patients.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { consultationsRouter } from "./routes/consultations.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/consultations", consultationsRouter);

app.use((err: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});
