import userModel from "../models/userModel.js";
import { hashPassword } from "../helpers/authHelper.js";

const parseBoolean = (value) => String(value).toLowerCase() === "true";

export const seedAdminUser = async () => {
  const shouldSeed = parseBoolean(process.env.SEED_ADMIN_ON_START);
  if (!shouldSeed) {
    return;
  }

  const email = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "").trim();
  const name = String(process.env.ADMIN_NAME || "System Admin").trim();
  const phone = String(process.env.ADMIN_PHONE || "").trim();
  const address = String(process.env.ADMIN_ADDRESS || "Localhost").trim();

  if (!email || !password || !phone) {
    console.warn(
      "[ADMIN SEED] Missing ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_PHONE. Skip seeding."
    );
    return;
  }

  const existing = await userModel.findOne({ email });
  if (existing) {
    if (existing.role !== 1) {
      existing.role = 1;
      await existing.save();
      console.log(`[ADMIN SEED] Upgraded existing user to admin: ${email}`);
    } else {
      console.log(`[ADMIN SEED] Admin already exists: ${email}`);
    }
    return;
  }

  const hashedPassword = await hashPassword(password);
  await userModel.create({
    name,
    email,
    password: hashedPassword,
    phone,
    address,
    role: 1,
  });

  console.log(`[ADMIN SEED] Created admin account: ${email}`);
};
