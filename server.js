import express from "express";
import "colors";
import dotenv from "dotenv";
import morgan from "morgan";
import path from "path";
import authRoutes from "./routes/authRoute.js";
import fileRoutes from "./routes/fileRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { errorHandler } from "./middlewares/errorMiddleware.js";
import connectDB from "./config/db.js";
import { seedAdminUser } from "./services/adminSeedService.js";


// config dotenv
dotenv.config();

// REST object
const app = express();



// middleware
app.use(morgan("dev"));
app.use(express.json());
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
