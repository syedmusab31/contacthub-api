const dotenv=require("dotenv").config();
const ConnectDb = require("./Config/dbConnection");
const errorHandler=require("./middleware/errorhandler");
const express=require('express');

ConnectDb();
const app=express();
const port = process.env.PORT || 3001;
console.log("PORT:", port); // Debug log
//creating middlewere
app.use(express.json());
app.use("/api/contacts",require("./routes/contactroutes"));
app.use("/api/users",require("./routes/userroutes"));
app.use(errorHandler);

app.listen(port,()=>{
    console.log(`server is running on port ${port}`);
})
