const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDatabase = require("./database");

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const isProduction = process.env.NODE_ENV === "production";
const COOKIE_NAME = "rs_pay_session";
const TOKEN_AGE = 7 * 24 * 60 * 60 * 1000;

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing from environment variables");
  process.exit(1);
}

// Normalize Bangladeshi mobile numbers
function normalizePhone(value) {
  let phone = String(value || "").replace(/[\s-]/g, "");

  if (phone.startsWith("01")) {
    phone = "+88" + phone;
  } else if (phone.startsWith("8801")) {
    phone = "+" + phone;
  }

  if (!/^\+8801[3-9]\d{8}$/.test(phone)) {
    return null;
  }

  return phone;
}

// User model
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    theme: {
      type: String,
      enum: ["purple", "blue", "green", "rose", "dark"],
      default: "purple"
    },
    phoneVerified: {
      type: Boolean,
      default: false
    },
    accountVerified: {
      type: Boolean,
      default: false
    },
    verificationStatus: {
      type: String,
      enum: ["not_submitted", "pending", "verified", "rejected"],
      default: "not_submitted"
    }
  },
  { timestamps: true }
);

const User =
  mongoose.models.RSPayUser ||
  mongoose.model("RSPayUser", userSchema);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।"
  }
});

function createToken(user) {
  return jwt.sign(
    { userId: user._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: TOKEN_AGE,
    path: "/"
  });
}

function safeUser(user) {
  return {
    id: user._id,
    name: user.name,
    phone: user.phone,
    theme: user.theme,
    phoneVerified: user.phoneVerified,
    accountVerified: user.accountVerified,
    verificationStatus: user.verificationStatus
  };
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "প্রথমে Login করুন।"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "অ্যাকাউন্ট পাওয়া যায়নি।"
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "আপনার Login সেশন শেষ হয়েছে। আবার Login করুন।"
    });
  }
}

// Register
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({
        success: false,
        message: "নাম ২ থেকে ৬০ অক্ষরের মধ্যে দিন।"
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "সঠিক বাংলাদেশি মোবাইল নম্বর দিন।"
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।"
      });
    }

    const existing = await User.findOne({ phone });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "এই মোবাইল নম্বরে ইতিমধ্যে অ্যাকাউন্ট আছে।"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      phone,
      passwordHash
    });

    const token = createToken(user);
    setSessionCookie(res, token);

    return res.status(201).json({
      success: true,
      message: "আপনার RS PAY অ্যাকাউন্ট তৈরি হয়েছে।",
      user: safeUser(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "এই মোবাইল নম্বরে ইতিমধ্যে অ্যাকাউন্ট আছে।"
      });
    }

    console.error("Registration error:", error.message);
    return res.status(500).json({
      success: false,
      message: "অ্যাকাউন্ট তৈরি করা যায়নি। আবার চেষ্টা করুন।"
    });
  }
});

// Login
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "মোবাইল নম্বর ও পাসওয়ার্ড দিন।"
      });
    }

    const user = await User.findOne({ phone }).select("+passwordHash");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়।"
      });
    }

    const matched = await bcrypt.compare(password, user.passwordHash);

    if (!matched) {
      return res.status(401).json({
        success: false,
        message: "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়।"
      });
    }

    const token = createToken(user);
    setSessionCookie(res, token);

    return res.json({
      success: true,
      message: "Login সফল হয়েছে।",
      user: safeUser(user)
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Login করা যায়নি। আবার চেষ্টা করুন।"
    });
  }
});

// Current user
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    success: true,
    user: safeUser(req.user)
  });
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/"
  });

  res.json({
    success: true,
    message: "Logout হয়েছে।"
  });
});

// Update profile and theme
app.patch("/api/profile", requireAuth, async (req, res) => {
  try {
    const updates = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();

      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({
          success: false,
          message: "নাম ২ থেকে ৬০ অক্ষরের মধ্যে দিন।"
        });
      }

      updates.name = name;
    }

    if (req.body.theme !== undefined) {
      const allowedThemes = ["purple", "blue", "green", "rose", "dark"];

      if (!allowedThemes.includes(req.body.theme)) {
        return res.status(400).json({
          success: false,
          message: "এই থিমটি সঠিক নয়।"
        });
      }

      updates.theme = req.body.theme;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "প্রোফাইল আপডেট হয়েছে।",
      user: safeUser(user)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "প্রোফাইল আপডেট করা যায়নি।"
    });
  }
});

// Verification is not active until an approved provider is connected
app.post("/api/verification/request", requireAuth, (req, res) => {
  res.status(503).json({
    success: false,
    message: "ভেরিফিকেশন সেবা এখনো সংযুক্ত করা হয়নি।",
    phoneVerified: req.user.phoneVerified,
    accountVerified: req.user.accountVerified
  });
});

// Existing service endpoint
app.get("/api/services", (req, res) => {
  res.json({
    success: true,
    services: [
      "Mobile Recharge",
      "Electricity Bill",
      "Gas Bill",
      "Water Bill",
      "Internet Bill",
      "TV Services",
      "Education Fees"
    ]
  });
});

app.get("/api", (req, res) => {
  res.json({
    name: "RS PAY",
    message: "Digital Payment Platform API",
    version: "1.1.0"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "RS PAY",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected"
  });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`RS PAY running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
