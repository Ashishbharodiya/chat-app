import User from "../models/user.model.js";
import Message from "../models/message.model.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!receiverId || !senderId) {
      return res.status(400).json({ error: "Receiver ID and Sender ID are required" });
    }

    let imageUrl = null;

    if (image) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(image);
        imageUrl = uploadResponse.secure_url;
      } catch (uploadError) {
        console.log("Error uploading image to Cloudinary:", uploadError.message);
        return res.status(500).json({ error: "Failed to upload image to Cloudinary" });
      }
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    try {
      await newMessage.save();
    } catch (dbError) {
      console.log("Error saving message to the database:", dbError.message);
      return res.status(500).json({ error: "Failed to save message to the database" });
    }

    try {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", newMessage);
      } else {
        console.log(`Receiver with ID ${receiverId} is not connected`);
      }
    } catch (socketError) {
      console.log("Error sending message to receiver's socket:", socketError.message);
    }

    res.status(201).json(newMessage);

  } catch (error) {
    console.log("Unexpected error in sendMessage controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

