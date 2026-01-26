import userModel from "../models/userModel.js";

import { comparePassword, hashPassword } from "../helpers/authHelper.js";
import JWT from "jsonwebtoken";
import { compare } from "bcryptjs";



export const registerController = async (req, res) => {
    try {
        const { name, email, password, phone, address } = req.body;
        if(!name){
            return res.send({error: "Name is required"});
        }
        if(!email){
            return res.send({error: "Email is required"});
        }
        if(!password){
            return res.send({error: "Password is required"});
        }
            if(!phone){
            return res.send({error: "Phone is required"});
        }
            if(!address){
            return res.send({error: "Address is required"});
        }

        // checking existing user
        const existingUser = await userModel.findOne({email});
        if(existingUser){
            return res.status(200).send({
                success: false,
                message: "Already registered please login",
            });
        }

        // register user

        const hashedPassword = await hashPassword(password);

        // save

            const user = await new userModel({
                name,
                email,
                password: hashedPassword,
                phone,
                address
            }).save();

        res.status(201).send({
            success: true,
            message: "User registered successfully",
            user,
        });

    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            message: "Error in register controller",
            error,
        });
    }
};
// POST Login

export const loginController = async (req, res) => {
    try {
        const { email, password } = req.body;
        // validation
        if(!email || !password){
            return res.status(404).send({
                success: false,
                message: "Invalid email or password",
            });
        }
        // check user

        const user = await userModel.findOne({email});
        if(!user){
            return res.status(404).send({ 
                success: false,
                message: "Email is not registered",
             })
        }
        const match = await comparePassword(password, user.password);
        if(!match){
            return res.status(200).send({
                success: false,
                message: 'Invalid Password'
            })
        }
        // token 
        const token = await JWT.sign({_id:user._id}, process.env.JWT_SECRET, {expiresIn:'7d'});
        res.status(200).send({
            success:true,
            message:'login successfully',
            user:{
                name:user.name,
                email:user.email,
                phone:user.phone,
                address:user.address,
            },
            token,
        });
     } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            message: "Error in login controller",
            error,
        });
     }
    };


    // test controller

    export const testController = (req,res) => {
        res.send('protected route')
    }