import mongoose from 'mongoose';
import 'colors';
import dotenv from 'dotenv';

// config dotenv
dotenv.config();

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URL) {
      throw new Error("MONGO_URL is missing in environment variables");
    }
    const conn = await mongoose.connect(process.env.MONGO_URL);

    console.log(
      `MongoDB Connected: ${conn.connection.host}`.cyan.underline
    );
  } catch (error) {
    console.error(
      `Error: ${error.message}`.red.bold
    );
    process.exit(1);
  }
};

export default connectDB;
