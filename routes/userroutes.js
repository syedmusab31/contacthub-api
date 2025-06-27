const express=require("express");
const { registeruser, loginuser,currentuser } = require("../controllers/usercontroller");
const router=express.Router();
//endpoints
//endpoint of registering user
router.post("/register",registeruser);
//endpoint for login
router.post("/login",loginuser);
//endpoint for saving current user data
router.get("/current",currentuser);

module.exports=router; 