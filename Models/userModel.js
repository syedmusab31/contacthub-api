//importing mongoose library for creating model schema
const mongoose=require("mongoose");

//schema of user model

const userSchema=mongoose.Schema({
    username:{
        type:String,
        required:[true,"Please add the username"]
    },
    email:{
        type:String,
        required:[true,"Please add user email"],
        unique:[true,"email is already registered"]
    },
    password:{
        type:String,
        required:[true,"Please add user password"],
        minlength: [8, "Password must be at least 8 characters"],
         match: [
        /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/,
        "Password must contain at least one uppercase letter, one number, and one special character",
      ],
    },
   

},
 {
        timestamps:true,
    }
);

module.exports=mongoose.model("user",userSchema);