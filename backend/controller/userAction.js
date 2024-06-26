// controllers/userActionController.js
const UserAction = require("../model/userAction");

exports.logUserAction = async (userId, action) => {
  try {
    await UserAction.create({
      userId: userId.toString(),  // Convert userId to string
      action,
    });
  } catch (error) {
    console.error("Error logging user action:", error);
  }
};
