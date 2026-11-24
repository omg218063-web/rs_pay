const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const crypto = require("crypto");
const connectDatabase = require("./database");

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET || !process.env.ADMIN_JWT_SECRET ||
    !process.env.ADMIN_PASSWORD) {
  throw new Error("JWT_SECRET, ADMIN_JWT_SECRET and ADMIN_PASSWORD are required");
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false
});

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/"
};

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  phone: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  theme: {
    type: String,
    enum: ["purple", "blue", "green", "rose", "dark"],
    default: "purple"
  },
  verificationStatus: {
    type: String,
    enum: ["unverified", "pending", "verified"],
    default: "unverified"
  }
}, { timestamps: true });

const BannerSchema = new mongoose.Schema({
  slot: {
    type: String,
    enum: ["landing_top", "landing_middle", "dashboard_home"],
    required: true
  },
  title: { type: String, maxlength: 100, default: "" },
  description: { type: String, maxlength: 300, default: "" },
  imageUrl: { type: String, default: "" },
  linkUrl: { type: String, default: "" },
  buttonText: { type: String, maxlength: 40, default: "" },
  enabled: { type: Boolean, default: false }
}, { timestamps: true });

const SiteContentSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "main" },
  landing: {
    title: { type: String, default: "Welcome to RS PAY" },
    subtitle: { type: String, default: "Your digital service platform" },
    buttonText: { type: String, default: "Get Started" },
    buttonLink: { type: String, default: "#register" }
  },
  colors: {
    primary: { type: String, default: "#7547c9" },
    secondary: { type: String, default: "#eac16d" }
  }
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);
const Banner = mongoose.model("Banner", BannerSchema);
const SiteContent = mongoose.model("SiteContent", SiteContentSchema);

function normalizePhone(value) {
  let phone = String(value || "").replace(/\D/g, "");

  if (phone.startsWith("880")) phone = "0" + phone.slice(3);
  if (phone.length === 10 && phone.startsWith("1")) phone = "0" + phone;

  if (!/^01[3-9]\d{8}$/.test(phone)) {
    throw new Error("Enter a valid Bangladesh mobile number");
  }

  return phone;
}

function signUser(user) {
  return jwt.sign(
    { id: user._id.toString(), role: "user" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function requireUser(req, res, next) {
  try {
    const token = req.cookies.rs_user;
    if (!token) return res.status(401).json({ message: "Please log in" });

    const data = jwt.verify(token, process.env.JWT_SECRET);
    if (data.role !== "user") throw new Error("Invalid role");

    req.userId = data.id;
    next();
  } catch {
    res.status(401).json({ message: "Session expired. Please log in again." });
  }
}

function requireAdmin(req, res, next) {
  try {
    const token = req.cookies.rs_admin;
    if (!token) return res.status(401).json({ message: "Admin login required" });

    const data = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (data.role !== "admin") throw new Error("Invalid role");

    next();
  } catch {
    res.status(401).json({ message: "Admin session expired" });
  }
}

function validHttpUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

// Public site content
app.get("/api/site-content", async (req, res) => {
  try {
    const content = await SiteContent.findOne({ key: "main" }).lean();
    const banners = await Banner.find({ enabled: true }).lean();

    res.json({
      content: content || {},
      banners
    });
  } catch {
    res.status(500).json({ message: "Could not load site content" });
  }
});

// Services are informational until an approved provider is connected.
app.get("/api/services", (req, res) => {
  res.json({
    liveTransactionsEnabled: false,
    services: [
      { id: "mobile", name: "Mobile Recharge", status: "preview" },
      { id: "electricity", name: "Electricity", status: "preview" },
      { id: "gas", name: "Gas", status: "preview" },
      { id: "water", name: "Water / WASA", status: "preview" },
      { id: "internet", name: "Internet", status: "preview" },
      { id: "education", name: "Education Fees", status: "preview" }
    ]
  });
});

// User registration
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({ message: "Enter a valid name" });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ message: "Password must be 8–72 characters" });
    }
    if (await User.exists({ phone })) {
      return res.status(409).json({ message: "This phone is already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, phone, passwordHash });

    res.cookie("rs_user", signUser(user), {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      message: "Account created",
      user: { name: user.name, phone: user.phone, theme: user.theme }
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Registration failed" });
  }
});

// User login
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    const user = await User.findOne({ phone }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Phone or password is incorrect" });
    }

    res.cookie("rs_user", signUser(user), {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: "Login successful",
      user: { name: user.name, phone: user.phone, theme: user.theme }
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Login failed" });
  }
});

app.get("/api/auth/me", requireUser, async (req, res) => {
  const user = await User.findById(req.userId).lean();
  if (!user) return res.status(404).json({ message: "User not found" });

  res.json({
    user: {
      name: user.name,
      phone: user.phone,
      theme: user.theme,
      verificationStatus: user.verificationStatus
    }
  });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("rs_user", cookieOptions);
  res.json({ message: "Logged out" });
});

app.put("/api/profile", requireUser, async (req, res) => {
  try {
    const update = {};

    if (typeof req.body.name === "string") {
      const name = req.body.name.trim();
      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({ message: "Invalid name" });
      }
      update.name = name;
    }

    if (["purple", "blue", "green", "rose", "dark"].includes(req.body.theme)) {
      update.theme = req.body.theme;
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: update },
      { new: true, runValidators: true }
    );

    res.json({
      message: "Profile updated",
      user: { name: user.name, phone: user.phone, theme: user.theme }
    });
  } catch {
    res.status(500).json({ message: "Profile update failed" });
  }
});

app.post("/api/verification/request", requireUser, async (req, res) => {
  await User.findByIdAndUpdate(req.userId, {
    verificationStatus: "pending"
  });
  res.json({ message: "Verification request submitted for review" });
});

// Admin login
app.post("/api/admin/login", adminLimiter, (req, res) => {
  const supplied = Buffer.from(String(req.body.password || ""));
  const expected = Buffer.from(process.env.ADMIN_PASSWORD);

  const valid = supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected);

  if (!valid) {
    return res.status(401).json({ message: "Incorrect admin password" });
  }

  const token = jwt.sign(
    { role: "admin" },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.cookie("rs_admin", token, {
    ...cookieOptions,
    maxAge: 8 * 60 * 60 * 1000
  });

  res.json({ message: "Admin login successful" });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ authenticated: true });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("rs_admin", cookieOptions);
  res.json({ message: "Admin logged out" });
});

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  const totalUsers = await User.countDocuments();
  const verifiedUsers = await User.countDocuments({
    verificationStatus: "verified"
  });
  const recentUsers = await User.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 7 * 86400000) }
  });

  res.json({
    totalUsers,
    verifiedUsers,
    recentUsers,
    orders: null,
    wallet: null,
    note: "Orders and wallet transactions are not enabled."
  });
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  const users = await User.find()
    .select("name phone verificationStatus createdAt")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json({
    users: users.map(user => ({
      ...user,
      phone: user.phone.replace(/^(\d{3})\d{5}(\d{3})$/, "$1*****$2")
    }))
  });
});

// Admin banner controls
app.get("/api/admin/banners", requireAdmin, async (req, res) => {
  res.json({ banners: await Banner.find().sort({ slot: 1 }).lean() });
});

app.put("/api/admin/banners/:slot", requireAdmin, async (req, res) => {
  const allowed = ["landing_top", "landing_middle", "dashboard_home"];
  if (!allowed.includes(req.params.slot)) {
    return res.status(400).json({ message: "Invalid banner slot" });
  }

  const imageUrl = validHttpUrl(req.body.imageUrl);
  const linkUrl = validHttpUrl(req.body.linkUrl);

  if (imageUrl === null || linkUrl === null) {
    return res.status(400).json({ message: "Only valid HTTP/HTTPS URLs are allowed" });
  }

  const banner = await Banner.findOneAndUpdate(
    { slot: req.params.slot },
    {
      $set: {
        title: String(req.body.title || "").slice(0, 100),
        description: String(req.body.description || "").slice(0, 300),
        imageUrl,
        linkUrl,
        buttonText: String(req.body.buttonText || "").slice(0, 40),
        enabled: req.body.enabled === true
      }
    },
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ message: "Banner saved", banner });
});

// Admin website text controls
app.get("/api/admin/site-content", requireAdmin, async (req, res) => {
  const content = await SiteContent.findOne({ key: "main" }).lean();
  res.json({ content: content || {} });
});

app.put("/api/admin/site-content", requireAdmin, async (req, res) => {
  const landing = req.body.landing || {};
  const colors = req.body.colors || {};

  const primary = /^#[0-9a-fA-F]{6}$/.test(colors.primary || "")
    ? colors.primary : "#7547c9";
  const secondary = /^#[0-9a-fA-F]{6}$/.test(colors.secondary || "")
    ? colors.secondary : "#eac16d";

  const content = await SiteContent.findOneAndUpdate(
    { key: "main" },
    {
      $set: {
        landing: {
          title: String(landing.title || "").slice(0, 100),
          subtitle: String(landing.subtitle || "").slice(0, 250),
          buttonText: String(landing.buttonText || "").slice(0, 40),
          buttonLink: String(landing.buttonLink || "#register").slice(0, 200)
        },
        colors: { primary, secondary }
      }
    },
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ message: "Website content saved", content });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "RS PAY" });
});

app.get("/api", (req, res) => {
  res.json({ name: "RS PAY API", status: "running" });
});

connectDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`RS PAY running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  });
