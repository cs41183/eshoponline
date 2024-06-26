const express = require("express");
const User = require("../model/user");
const router = express.Router();
const cloudinary = require("cloudinary").v2;
const sharp = require("sharp");
const ErrorHandler = require("../utils/ErrorHandler");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const jwt = require("jsonwebtoken");
const sendMail = require("../utils/sendMail");
const sendToken = require("../utils/jwtToken");
const { isAuthenticated, isAdmin } = require("../middleware/auth");
const { logUserAction } = require('./userAction');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Function to optimize and upload image to Cloudinary
const optimizeAndUploadImage = async (base64Image) => {
  try {
    // Extract the base64 data part from the image string
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

    // Convert the base64 string to a buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Optimize the image using sharp
    const optimizedImageBuffer = await sharp(imageBuffer)
      .resize({ width: 500 }) // Resize to a max width of 500px
      .toBuffer();

    // Upload optimized buffer to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "avatars",
          resource_type: "image",
        },
        (error, result) => {
          if (error) reject(error);
          resolve(result);
        }
      );
      uploadStream.end(optimizedImageBuffer);
    });

    return result;
  } catch (error) {
    console.error("Error uploading image to Cloudinary:", error);
    throw new Error("Image upload failed");
  }
};


// Create user (signup)
router.post("/create-user", catchAsyncErrors(async (req, res, next) => {
  const { name, email, password, avatar } = req.body;
  const userEmail = await User.findOne({ email });

  if (userEmail) {
    return next(new ErrorHandler("User already exists", 400));
  }

  const myCloud = await optimizeAndUploadImage(avatar);

  const user = new User({
    name,
    email,
    password,
    avatar: {
      public_id: myCloud.public_id,
      url: myCloud.secure_url,
    },
  });

  const activationToken = createActivationToken(user);

  const activationUrl = `http://localhost:3000/activation/${activationToken}`;

  await sendMail({
    email: user.email,
    subject: "Activate your account",
    message: `Hello ${user.name}, please click on the link to activate your account: ${activationUrl}`,
  });

  // Save the user to the database after sending the activation email
  await user.save();

  // Log user action (signup)
  await logUserAction(user._id.toString(), 'Signed up');

  res.status(201).json({
    success: true,
    message: `Please check your email: ${user.email} to activate your account!`,
  });
}));

// Create activation token
const createActivationToken = (user) => {
  return jwt.sign({ id: user._id }, process.env.ACTIVATION_SECRET, {
    expiresIn: "5m",
  });
};

// Activate user
router.post(
  "/activation",
  catchAsyncErrors(async (req, res, next) => {
    const { activation_token } = req.body;

    const decoded = jwt.verify(activation_token, process.env.ACTIVATION_SECRET);

    const user = await User.findById(decoded.id);

    if (!user) {
      return next(new ErrorHandler("Invalid token", 400));
    }

    user.active = true;
    await user.save();

    sendToken(user, 201, res);
  })
);

// login user
router.post(
  "/login-user",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return next(new ErrorHandler("Please provide the all fields!", 400));
      }

      const user = await User.findOne({ email }).select("+password");

      if (!user) {
        return next(new ErrorHandler("User doesn't exists!", 400));
      }

      const isPasswordValid = await user.comparePassword(password);

      if (!isPasswordValid) {
        return next(
          new ErrorHandler("Please provide the correct information", 400)
        );
      }

      sendToken(user, 201, res);

      
      // Log user action (login)
      await logUserAction(user._id.toString(), 'Logged in');
      
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// load user
router.get(
  "/getuser",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id);

      if (!user) {
        return next(new ErrorHandler("User doesn't exists", 400));
      }

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// log out user
router.get(
  "/logout",
  catchAsyncErrors(async (req, res, next) => {
    try {
      res.cookie("token", null, {
        expires: new Date(Date.now()),
        httpOnly: true,
        sameSite: "none",
        secure: true,
      });
      res.status(201).json({
        success: true,
        message: "Log out successful!",
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// update user info
router.put(
  "/update-user-info",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const { email, password, phoneNumber, name } = req.body;

      const user = await User.findOne({ email }).select("+password");

      if (!user) {
        return next(new ErrorHandler("User not found", 400));
      }

      const isPasswordValid = await user.comparePassword(password);

      if (!isPasswordValid) {
        return next(
          new ErrorHandler("Please provide the correct information", 400)
        );
      }

      user.name = name;
      user.email = email;
      user.phoneNumber = phoneNumber;

      await user.save();

      res.status(201).json({
        success: true,
        user,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// Update user avatar
router.put(
  "/update-avatar",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      console.log("Update avatar request received");

      let existsUser = await User.findById(req.user.id);
      if (!existsUser) {
        return next(new ErrorHandler("User not found", 404));
      }

      console.log("User found:", existsUser);

      if (req.body.avatar !== "") {
        const imageId = existsUser.avatar.public_id;

        console.log("Existing image ID:", imageId);

        if (imageId) {
          await cloudinary.uploader.destroy(imageId);
          console.log("Existing image deleted from Cloudinary");
        }

        const myCloud = await optimizeAndUploadImage(req.body.avatar);
        console.log("Image uploaded to Cloudinary:", myCloud);

        existsUser.avatar = {
          public_id: myCloud.public_id,
          url: myCloud.secure_url,
        };
      } else {
        return next(new ErrorHandler("Avatar not provided", 400));
      }

      await existsUser.save();
      console.log("User updated with new avatar:", existsUser);

      res.status(200).json({
        success: true,
        user: existsUser,
      });
    } catch (error) {
      console.error("Error in updating avatar:", error);
      return next(new ErrorHandler(error.message, 500));
    }
  })
);


// update user addresses
router.put(
  "/update-user-addresses",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id);

      const sameTypeAddress = user.addresses.find(
        (address) => address.addressType === req.body.addressType
      );
      if (sameTypeAddress) {
        return next(
          new ErrorHandler(`${req.body.addressType} address already exists`)
        );
      }

      const existsAddress = user.addresses.find(
        (address) => address._id === req.body._id
      );

      if (existsAddress) {
        Object.assign(existsAddress, req.body);
      } else {
        // add the new address to the array
        user.addresses.push(req.body);
      }

      await user.save();

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// delete user address
router.delete(
  "/delete-user-address/:id",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const userId = req.user._id;
      const addressId = req.params.id;

      await User.updateOne(
        {
          _id: userId,
        },
        { $pull: { addresses: { _id: addressId } } }
      );

      const user = await User.findById(userId);

      res.status(200).json({ success: true, user });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// update user password
router.put(
  "/update-user-password",
  isAuthenticated,
  catchAsyncErrors(async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id).select("+password");

      const isPasswordMatched = await user.comparePassword(
        req.body.oldPassword
      );

      if (!isPasswordMatched) {
        return next(new ErrorHandler("Old password is incorrect!", 400));
      }

      if (req.body.newPassword !== req.body.confirmPassword) {
        return next(
          new ErrorHandler("Password doesn't matched with each other!", 400)
        );
      }
      user.password = req.body.newPassword;

      await user.save();

      res.status(200).json({
        success: true,
        message: "Password updated successfully!",
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// find user infoormation with the userId
router.get(
  "/user-info/:id",
  catchAsyncErrors(async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);

      res.status(201).json({
        success: true,
        user,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// all users --- for admin
router.get(
  "/admin-all-users",
  isAuthenticated,
  isAdmin("Admin"),
  catchAsyncErrors(async (req, res, next) => {
    try {
      const users = await User.find().sort({
        createdAt: -1,
      });
      res.status(201).json({
        success: true,
        users,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

// delete users --- admin
router.delete(
  "/delete-user/:id",
  isAuthenticated,
  isAdmin("Admin"),
  catchAsyncErrors(async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);

      if (!user) {
        return next(
          new ErrorHandler("User is not available with this id", 400)
        );
      }

      const imageId = user.avatar.public_id;

      await cloudinary.v2.uploader.destroy(imageId);

      await User.findByIdAndRemove(req.params.id);

      res.status(201).json({
        success: true,
        message: "User deleted successfully!",
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

module.exports = router;
