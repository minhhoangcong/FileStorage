import "dotenv/config";
import express from "express";
import "colors";
import morgan from "morgan";
import path from "path";
import mongoose from "mongoose";
import authRoutes from "./routes/authRoute.js";
import fileRoutes from "./routes/fileRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { errorHandler } from "./middlewares/errorMiddleware.js";
import { corsMiddleware, securityHeaders } from "./middlewares/securityHeadersMiddleware.js";
import connectDB from "./config/db.js";
import { seedAdminUser } from "./services/adminSeedService.js";

// REST object
const app = express();
app.disable("x-powered-by");

if (String(process.env.TRUST_PROXY || "false").toLowerCase() === "true") {
  app.set("trust proxy", 1);
}

// middleware
if (process.env.DEV_MODE !== "production") {
  app.use(morgan("dev"));
}
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(
  express.static(path.resolve("public"), {
    etag: false,
    maxAge: 0,
  })
);
app.use("/uploads", express.static(path.resolve("uploads")));

//routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/files", fileRoutes);
app.use("/api/v1/admin", adminRoutes);



// REST API
app.get("/", (_req, res) => {
  res.sendFile(path.resolve("public/index.html"));
});
app.get("/healthz", (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  return res.status(dbReady ? 200 : 503).send({
    success: dbReady,
    status: dbReady ? "ok" : "degraded",
    db: dbReady ? "up" : "down",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
app.use(errorHandler);

// PORT
const PORT = process.env.PORT || 8080;

const bootstrap = async () => {
  try {
    await connectDB();
    await seedAdminUser();

    app.listen(PORT, () => {
      console.log(
        `Server is running in ${process.env.DEV_MODE} mode on port ${PORT}`.bgCyan.white
      );
    });
  } catch (error) {
    console.error(`Server bootstrap error: ${error.message}`.red.bold);
    process.exit(1);
  }
};

bootstrap();
