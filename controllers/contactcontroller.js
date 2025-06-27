const asyncHandler = require("express-async-handler");
const Contact = require("../Models/contactModel");
const mongoose=require("mongoose");
//@desc get all contacts
//route get api/contacts
//@access public

const getcontacts = asyncHandler(async (req, res) => {
  //getting contacts
  const contacts = await Contact.find();
  res.status(200).json({ contacts });
});
//@desc get 1 contacts
//route get api/contacts/:id
//@access public

const getcontact = asyncHandler(async (req, res) => {
  //get individual contact
  const contact = await Contact.findById(req.params.id);
  //error handling
  if (!contact) {
    res.status(404);
    throw new Error("Contact Not Found");
  }
  res.status(200).json({ contact });
});
//@desc create contact
//route post api/contacts
//@access public

const postcontacts = asyncHandler(async (req, res) => {
  console.log("the body of request is ", req.body);
  const { name, email, phone } = req.body;
  if (!name || !email || !phone) {
    res.status(400);
    throw new Error("all fields are required");
  }
  //creating new contact
  const contact = await Contact.create({
    name,
    email,
    phone,
  });
  res.status(201).json({ contact });
});
//@desc update contact
//route put api/contacts/:id
//@access public

const putcontacts = asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id);
  if (!contact) {
    res.status(404);
    throw new Error("Contact Not Found");
  }
  const updatedcotact = await Contact.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true } // return the updated document
  );
  res.status(200).json({ updatedcotact });
});
//@desc delete contacts
//route delete api/contacts/:id
//@access public

const deletecontacts = asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id);
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.statusCode = 400;
    throw new Error("Invalid Contact ID format");
  }
  if (!contact) {
    res.statusCode = 400;
    throw new Error("Contact Not Found");
  }
  await contact.deleteOne();
  res.status(200).json({ message: "delete Contact for id " + req.params.id });
});
module.exports = {
  getcontacts,
  getcontact,
  postcontacts,
  putcontacts,
  deletecontacts,
};
