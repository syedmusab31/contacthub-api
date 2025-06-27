const asyncHandler = require("express-async-handler");
const User = require("../Models/userModel");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const jwt=require("jsonwebtoken");
//@desc register a user
//route post api/users/register
//@access public

const registeruser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    res.status(404);
    throw new Error("All fields are mandatory");
  }
  const userAvailable = await User.findOne({ email });
  if (userAvailable) {
    res.status(400);
    throw new Error("User already exists");
  }
  const passwordRegex =
    /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

  if (!passwordRegex.test(password)) {
    res.status(400);
    throw new Error(
      "Password must contain at least one uppercase letter, one number, and one special character"
    );
  }

  //hash password
  const hashedpassword = await bcrypt.hash(password, 10);
  console.log(hashedpassword);
  // Create user
  const user = await User.create({
    username,
    email,
    password: hashedpassword,
  });
  if (!user) {
    res.status(500);
    throw new Error("User could not be created");
  }
  res.status(201).json({
    message: "User registered successfully",
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
    },
  }),
    res.json({ message: "Register the user" });
});
//@desc login a user
//route post api/users/login
//@access public

const loginuser = asyncHandler(async (req, res) => {
    const {email,password}=req.body;
    if ( !email || !password) {
    res.status(404);
    throw new Error("All fields are mandatory");
  }
  const user=await User.findOne({email});
  //compare password with hashed password
  if(user && bcrypt.compare(password,user.password)){
    const accesstoken=jwt.sign({
        user:{
            username:user.username,
            email:user.email,
            id:user.id,
        }
    },process.env.Access_Token_Secret,{ExpireIn:"1m "});
    res.status(200).json({accesstoken});
  }
  res.json({ message: "login the user" });
});
//@desc current user information
//route post api/users/current
//@access private

const currentuser = asyncHandler(async (req, res) => {
  res.json({ message: "current the user information" });
});

module.exports = { registeruser, loginuser, currentuser };
