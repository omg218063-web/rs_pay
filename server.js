
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
const ADMIN_COOKIE = "rs_pay_admin";
const TOKEN_AGE = 7 * 24 * 60 * 60 * 1000;

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing");
  process.exit(1);
}

if (!process.env.ADMIN_JWT_SECRET) {
  console.error("ADMIN_JWT_SECRET is missing");
  process.exit(1);
}

function normalizePhone(value) {
  let phone = String(value || "").replace(/[\s-]/g, "");

  if (phone.startsWith("01")) phone = "+88" + phone;
  else if (phone.startsWith("8801")) phone = "+" + phone;

  return /^\+8801[3-9]\d{8}$/.test(phone) ? phone : null;
}

// USER MODEL
const userSchema = new mongoose.Schema({
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
    unique: true
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
  phoneVerified: { type: Boolean, default: false },
  accountVerified: { type: Boolean, default: false },
  verificationStatus: {
    type: String,
    enum: ["not_submitted", "pending", "verified", "rejected"],
    default: "not_submitted"
  }
}, { timestamps: true });

const User = mongoose.models.RSPayUser ||
  mongoose.model("RSPayUser", userSchema);

// WEBSITE CONTENT MODEL
const siteSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "main" },
  landing: {
    title: { type: String, default: "Your Digital World, Simplified" },
    subtitle: { type: String, default: "এক জায়গায় প্রয়োজনীয় ডিজিটাল সেবা" },
    buttonText: { type: String, default: "Get Started" },
    buttonLink: { type: String, default: "" }
  },
  colors: {
    primary: { type: String, default: "#7138d5" },
    secondary: { type: String, default: "#d7ad55" }
  }
}, { timestamps: true });

const SiteContent = mongoose.models.RSPaySiteContent ||
  mongoose.model("RSPaySiteContent", siteSchema);

// THREE BANNER MODEL
const bannerSchema = new mongoose.Schema({
  slot: {
    type: String,
    enum: ["landing_top", "landing_middle", "dashboard_home"],
    unique: true,
    required: true
  },
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  imageUrl: { type: String, default: "" },
  linkUrl: { type: String, default: "" },
  buttonText: { type: String, default: "" },
  enabled: { type: Boolean, default: false }
}, { timestamps: true });

const Banner = mongoose.models.RSPayBanner ||
  mongoose.model("RSPayBanner", bannerSchema);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "অনেকবার চেষ্টা হয়েছে। পরে চেষ্টা করুন।" }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "অনেকবার চেষ্টা হয়েছে। পরে চেষ্টা করুন।" }
});

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

function createUserToken(user) {
  return jwt.sign(
    { userId: user._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function setCookie(res, name, token) {
  res.cookie(name, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: TOKEN_AGE,
    path: "/"
  });
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
  } catch {
    return res.status(401).json({
      success: false,
      message: "Login সেশন শেষ হয়েছে। আবার Login করুন।"
    });
  }
}

// ADMIN AUTHENTICATION
function createAdminToken() {
  return jwt.sign(
    { role: "admin" },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function requireAdmin(req, res, next) {
  try {
    const token = req.cookies[ADMIN_COOKIE];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Admin Login প্রয়োজন।"
      });
    }

    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "অনুমতি নেই।"
      });
    }

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Admin সেশন শেষ হয়েছে। আবার Login করুন।"
    });
  }
}

// REGISTER
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (name.length < 2 || name.length > 60 || !phone ||
        password.length < 8 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "নাম, সঠিক মোবাইল নম্বর ও কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন।"
      });
    }

    if (await User.findOne({ phone })) {
      return res.status(409).json({
        success: false,
        message: "এই নম্বরে অ্যাকাউন্ট আগে থেকেই আছে।"
      });
    }

    const user = await User.create({
      name,
      phone,
      passwordHash: await bcrypt.hash(password, 12)
    });

    setCookie(res, COOKIE_NAME, createUserToken(user));

    res.status(201).json({
      success: true,
      message: "অ্যাকাউন্ট তৈরি হয়েছে।",
      user: safeUser(user)
    });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 500).json({
      success: false,
      message: error.code === 11000
        ? "এই নম্বরে অ্যাকাউন্ট আগে থেকেই আছে।"
        : "অ্যাকাউন্ট তৈরি করা যায়নি।"
    });
  }
});

// LOGIN
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

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        success: false,
        message: "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়।"
      });
    }

    setCookie(res, COOKIE_NAME, createUserToken(user));

    res.json({
      success: true,
      message: "Login সফল হয়েছে।",
      user: safeUser(user)
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Login করা যায়নি।"
    });
  }
});

// CURRENT USER
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ success: true, user: safeUser(req.user) });
});

// USER LOGOUT
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/"
  });

  res.json({ success: true, message: "Logout হয়েছে।" });
});

// PROFILE UPDATE
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
      const themes = ["purple", "blue", "green", "rose", "dark"];
      if (!themes.includes(req.body.theme)) {
        return res.status(400).json({
          success: false,
          message: "সঠিক Theme নির্বাচন করুন।"
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
  } catch {
    res.status(500).json({
      success: false,
      message: "প্রোফাইল আপডেট করা যায়নি।"
    });
  }
});

// VERIFICATION PLACEHOLDER
app.post("/api/verification/request", requireAuth, (req, res) => {
  res.status(503).json({
    success: false,
    message: "ভেরিফিকেশন সেবা এখনো সংযুক্ত করা হয়নি।"
  });
});

// PUBLIC WEBSITE CONTENT
app.get("/api/site-content", async (req, res) => {
  try {
    let content = await SiteContent.findOne({ key: "main" });

    if (!content) content = await SiteContent.create({ key: "main" });

    const banners = await Banner.find({ enabled: true }).select("-__v");

    res.json({
      success: true,
      content,
      banners
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Website content পাওয়া যায়নি।"
    });
  }
});

// PUBLIC SERVICE LIST
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

// ADMIN LOGIN
app.post("/api/admin/login", adminLimiter, (req, res) => {
  const password = String(req.body.password || "");
  const adminPassword = process.env.ADMIN_PASSWORD || "";

  if (!adminPassword) {
    return res.status(503).json({
      success: false,
      message: "Admin password Render Environment-এ সেট করা হয়নি।"
    });
  }

  const passwordBuffer = Buffer.from(password);
  const adminBuffer = Buffer.from(adminPassword);

  const crypto = require("crypto");
  const valid =
    passwordBuffer.length === adminBuffer.length &&
    crypto.timingSafeEqual(passwordBuffer, adminBuffer);

  if (!valid) {
    return res.status(401).json({
      success: false,
      message: "Admin Password সঠিক নয়।"
    });
  }

  setCookie(res, ADMIN_COOKIE, createAdminToken());

  res.json({
    success: true,
    message: "Admin Login সফল হয়েছে।"
  });
});

// ADMIN SESSION CHECK
app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ success: true, role: "admin" });
});

// ADMIN LOGOUT
app.post("/api/admin/logout", (req, res) => {
  res.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/"
  });

  res.json({ success: true, message: "Admin Logout হয়েছে।" });
});

// ADMIN DASHBOARD STATS
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({
      accountVerified: true
    });
    const recentUsers = await User.countDocuments({
      createdAt: {
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        verifiedUsers,
        recentUsers,
        orders: null,
        wallet: null,
        ordersMessage: "Order database এখনো সংযুক্ত হয়নি।",
        walletMessage: "Wallet ledger এখনো তৈরি হয়নি।"
      }
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Dashboard তথ্য পাওয়া যায়নি।"
    });
  }
});

// ADMIN USER LIST
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select("name phone theme phoneVerified accountVerified verificationStatus createdAt")
      .sort({ createdAt: -1 })
      .limit(100);

    const safeUsers = users.map(user => ({
      id: user._id,
      name: user.name,
      phone: user.phone.replace(
        /^(\+8801\d{2})\d{5}(\d{2})$/,
        "$1*****$2"
      ),
      theme: user.theme,
      phoneVerified: user.phoneVerified,
      accountVerified: user.accountVerified,
      verificationStatus: user.verificationStatus,
      createdAt: user.createdAt
    }));

    res.json({ success: true, users: safeUsers });
  } catch {
    res.status(500).json({
      success: false,
      message: "User list পাওয়া যায়নি।"
    });
  }
});

// ADMIN GET ALL BANNERS
app.get("/api/admin/banners", requireAdmin, async (req, res) => {
  try {
    const banners = await Banner.find().sort({ slot: 1 });
    res.json({ success: true, banners });
  } catch {
    res.status(500).json({
      success: false,
      message: "Banner পাওয়া যায়নি।"
    });
  }
});

// ADMIN UPDATE BANNER
app.put("/api/admin/banners/:slot", requireAdmin, async (req, res) => {
  try {
    const allowedSlots = [
      "landing_top",
      "landing_middle",
      "dashboard_home"
    ];

    if (!allowedSlots.includes(req.params.slot)) {
      return res.status(400).json({
        success: false,
        message: "সঠিক Banner Slot নির্বাচন করুন।"
      });
    }

    const fields = [
      "title",
      "description",
      "imageUrl",
      "linkUrl",
      "buttonText",
      "enabled"
    ];

    const updates = {};

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        if (field === "enabled") {
          updates[field] = Boolean(req.body[field]);
        } else {
          const value = String(req.body[field]);
          if (value.length > 2000) {
            return res.status(400).json({
              success: false,
              message: "Banner তথ্য অনেক বড়।"
            });
          }
          updates[field] = value;
        }
      }
    }

    const banner = await Banner.findOneAndUpdate(
      { slot: req.params.slot },
      { $set: updates, $setOnInsert: { slot: req.params.slot } },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Banner সংরক্ষণ হয়েছে।",
      banner
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Banner সংরক্ষণ করা যায়নি।"
    });
  }
});

// ADMIN WEBSITE CONTENT
app.get("/api/admin/site-content", requireAdmin, async (req, res) => {
  try {
    let content = await SiteContent.findOne({ key: "main" });
    if (!content) content = await SiteContent.create({ key: "main" });

    res.json({ success: true, content });
  } catch {
    res.status(500).json({
      success: false,
      message: "Website Settings পাওয়া যায়নি।"
    });
  }
});

app.put("/api/admin/site-content", requireAdmin, async (req, res) => {
  try {
    const allowed = ["landing", "colors"];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const content = await SiteContent.findOneAndUpdate(
      { key: "main" },
      { $set: updates, $setOnInsert: { key: "main" } },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Website Settings সংরক্ষণ হয়েছে।",
      content
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Website Settings সংরক্ষণ করা যায়নি।"
    });
  }
});

// API INFO
app.get("/api", (req, res) => {
  res.json({
    name: "RS PAY",
    message: "Digital Payment Platform API",
    version: "2.0.0"
  });
});

// HEALTH
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
