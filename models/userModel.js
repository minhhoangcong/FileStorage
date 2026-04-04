import mongoose from "mongoose";


const userSchema = new mongoose.Schema({
    
    name: {
        type: String,
        required: true,
        trim:true
    },
    email:{
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password:{
        type: String,
        required: true,
    },
    phone:{
        type: String,
        required: true,
        unique: true,
    },
    address:{
        type: String,
        required: true,
    },
    role:{
        type: Number,
        default: 0, // 0 - user, 1 - admin
        enum: [0, 1],
    }
},{timestamps: true})

export default mongoose.model("users", userSchema);

// users --> collection name in mongodb
// userSchema --> schema name in mongoose or reference
