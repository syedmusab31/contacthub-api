//importing mongoose library for creating model schema
const mongoose=require("mongoose");

//schema for contacts database

const contactSchema=mongoose.Schema({
    name:{
        type:String,
        required:[true,"Please add contact name"]
    },
    email:{
        type:String,
        required:[true,"Please add contact email"]
    },
    phone:{
        type:String,
        required:[true,"Please add contact phone number"]
    },
   

},
 {
        timestamps:true,
    }
);

module.exports=mongoose.model("contact",contactSchema);