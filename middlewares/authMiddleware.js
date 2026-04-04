import JWT from "jsonwebtoken";
import userModel from "../models/userModel.js";

export const requireSignIn = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).send({
        success: false,
        message: "Authorization token is required",
      });
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : authHeader;

    const decode = JWT.verify(token, process.env.JWT_SECRET);
    const user = await userModel.findById(decode._id).select("_id role");
    if (!user) {
      return res.status(401).send({
        success: false,
        message: "Invalid token user",
      });
    }

    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).send({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export const isAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 1) {
      return res.status(403).send({
        success: false,
        message: "Unauthorized access",
      });
    }

    return next();
  } catch (error) {
    return res.status(401).send({
      success: false,
      message: "Error in admin middleware",
      error: error.message,
    });
  }
};
