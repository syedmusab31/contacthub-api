const express=require('express');
const router=express.Router();
const {getcontacts,
    getcontact,
    postcontacts,
    putcontacts,
    deletecontacts,
}=require("../controllers/contactcontroller")
//defining routes here
//route for reading contact
//route for creating contact
router.route("/",).get(getcontacts).post(postcontacts);
//for reading single contact
//route for updating contacts
//route for deleting contacts
//aligned routes on same route
router.route("/:id",).get(getcontact).put(putcontacts).delete(deletecontacts)




module.exports=router;