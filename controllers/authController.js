import userModel from "../models/userModel.js";
import { comparePassword, hashPassword } from "../helpers/authHelper.js";
import JWT from "jsonwebtoken";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizePhone = (value) => String(value || "").trim();

const getDuplicateField = (error) => {
  if (!error || error.code !== 11000) return null;
  const byPattern = Object.keys(error.keyPattern || {})[0];
  if (byPattern) return byPattern;

  const raw = String(error.message || "").toLowerCase();
  if (raw.includes("email")) return "email";
  if (raw.includes("phone")) return "phone";
  return "unknown";
};

export const registerController = async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;
    const cleanName = String(name || "").trim();
    const cleanEmail = normalizeEmail(email);
    const cleanPhone = normalizePhone(phone);
    const cleanAddress = String(address || "").trim();
    const cleanPassword = String(password || "");

    if (!name) {
      return res.status(400).send({ success: false, message: "Name is required" });
    }
    if (!cleanEmail) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }
    if (!cleanPassword) {
      return res.status(400).send({ success: false, message: "Password is required" });
    }
    if (!cleanPhone) {
      return res.status(400).send({ success: false, message: "Phone is required" });
    }
    if (!cleanAddress) {
      return res.status(400).send({ success: false, message: "Address is required" });
    }

    const existingUser = await userModel.findOne({
      $or: [{ email: cleanEmail }, { phone: cleanPhone }],
    });
    if (existingUser) {
      if (existingUser.email === cleanEmail) {
        return res.status(409).send({
          success: false,
          field: "email",
          message: "Email is already registered",
        });
      }
      if (existingUser.phone === cleanPhone) {
        return res.status(409).send({
          success: false,
          field: "phone",
          message: "Phone is already registered",
        });
      }
      return res.status(409).send({
        success: false,
        message: "Account already exists, please login",
      });
    }

    const hashedPassword = await hashPassword(cleanPassword);

    const user = await new userModel({
      name: cleanName,
      email: cleanEmail,
      password: hashedPassword,
      phone: cleanPhone,
      address: cleanAddress,
    }).save();

    return res.status(201).send({
      success: true,
      message: "User registered successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
      },
    });
  } catch (error) {
    const duplicateField = getDuplicateField(error);
    if (duplicateField === "email") {
      return res.status(409).send({
        success: false,
        field: "email",
        message: "Email is already registered",
      });
    }
    if (duplicateField === "phone") {
      return res.status(409).send({
        success: false,
        field: "phone",
        message: "Phone is already registered",
      });
    }

    return res.status(500).send({
      success: false,
      message: "Registration failed. Please try again",
    });
  }
};

export const loginController = async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = normalizeEmail(email);
    const cleanPassword = String(password || "");

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).send({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await userModel.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).send({
        success: false,
        message: "Email is not registered",
      });
    }

    const match = await comparePassword(cleanPassword, user.password);
    if (!match) {
      return res.status(401).send({
        success: false,
        message: "Invalid password",
      });
    }

    const token = JWT.sign(
      { _id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).send({
      success: true,
      message: "Login successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error in login controller",
      error: error.message,
    });
  }
};

export const meController = async (req, res) => {
  try {
    const user = await userModel
      .findById(req.user._id)
      .select("_id name email phone address role createdAt");

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).send({
      success: true,
      user,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Error in me controller",
      error: error.message,
    });
  }
};

export const testController = (_req, res) => {
  res.status(200).send("protected route");
};
