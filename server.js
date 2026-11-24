
"use strict";

// ============================================
// RS PAY - SERVER.JS
// Existing MongoDB and existing service data
// ============================================

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const connectDatabase = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;
const production = process.env.NODE_ENV === "production";

if (production) {
  app.set("trust proxy", 1);
}

// ============================================
// SECURITY
// ============================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:"
      ],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"]
    }
  }
}));

app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({
  extended: false,
  limit: "20kb"
}));

// ============================================
// EXISTING DATABASE MODELS
// ============================================

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
  },

  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  passwordHash: {
    type: String,
    required: true,
    select: false
  }
}, {
  timestamps: true,
  strict: false
});

const User =
  mongoose.models.User ||
  mongoose.model("User", UserSchema);


// Existing service collection.
// strict:false keeps any existing service fields.

const ServiceSchema = new mongoose.Schema({}, {
  timestamps: true,
  strict: false
});

const Service =
  mongoose.models.Service ||
  mongoose.model("Service", ServiceSchema);


// Existing banner collection.

const BannerSchema = new mongoose.Schema({}, {
  timestamps: true,
  strict: false
});

const Banner =
  mongoose.models.Banner ||
  mongoose.model("Banner", BannerSchema);


// Existing website content collection.

const SiteContentSchema = new mongoose.Schema({}, {
  timestamps: true,
  strict: false
});

const SiteContent =
  mongoose.models.SiteContent ||
  mongoose.model("SiteContent", SiteContentSchema);


// ============================================
// SESSION
// ============================================

const sessionSecret = process.env.SESSION_SECRET;

if (production && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error("SESSION_SECRET must contain at least 32 characters");
}

app.use(session({
  name: "rs_pay_session",
  secret: sessionSecret || "local-only-rs-pay-development-secret",
  resave: false,
  saveUninitialized: false,

  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    dbName: process.env.DB_NAME || "rs_pay",
    collectionName: "sessions",
    ttl: 14 * 24 * 60 * 60
  }),

  cookie: {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
}));

// ============================================
// RATE LIMIT
// ============================================

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================
// BASIC REQUEST PROTECTION
// ============================================

app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");

    if (origin) {
      try {
        if (new URL(origin).host !== req.get("host")) {
          return res.status(403).json({
            success: false,
            message: "অননুমোদিত অনুরোধ।"
          });
        }
      } catch {
        return res.status(403).json({
          success: false,
          message: "অননুমোদিত অনুরোধ।"
        });
      }
    }
  }

  next();
});

// ============================================
// HELPERS
// ============================================

function clean(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePhone(value) {
  let digits = String(value || "")
    .replace(/[০-৯]/g, d => "০১২৩৪৫৬৭৮৯".indexOf(d))
    .replace(/\D/g, "");

  if (digits.startsWith("00880")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("880")) {
    digits = "0" + digits.slice(3);
  }

  if (/^1[3-9]\d{8}$/.test(digits)) {
    digits = "0" + digits;
  }

  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "প্রথমে লগইন করুন।"
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (req.session.adminAuthenticated !== true) {
    return res.status(401).json({
      success: false,
      message: "অ্যাডমিন লগইন প্রয়োজন।"
    });
  }

  next();
}

function publicUser(user) {
  return {
    name: user.name,
    phone: user.phone
  };
}

function validUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(String(value));

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function makeKey(value) {
  return clean(value, 60)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || crypto.randomUUID();
}

// ============================================
// USER REGISTRATION
// First Name + Mobile + Password
// ============================================

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = clean(req.body.name, 60);
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (name.length < 2) {
      return res.status(400).json({
        success: false,
        message: "সঠিক নাম লিখুন।"
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "সঠিক বাংলাদেশি মোবাইল নম্বর দিন।"
      });
    }

    if (password.length < 10 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "পাসওয়ার্ড ১০ থেকে ৭২ অক্ষরের মধ্যে দিন।"
      });
    }

    const exists = await User.findOne({ phone });

    if (exists) {
      return res.status(409).json({
        success: false,
        message: "এই নম্বরে অ্যাকাউন্ট আগে থেকেই আছে।"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Existing required email field compatibility.
    const email = `${phone}@users.rs-pay.invalid`;

    const user = await User.create({
      name,
      phone,
      email,
      passwordHash
    });

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "সেশন তৈরি করা যায়নি।"
        });
      }

      req.session.userId = user._id.toString();

      res.status(201).json({
        success: true,
        user: publicUser(user)
      });
    });

  } catch (error) {
    console.error("Register error:", error);

    res.status(error.code === 11000 ? 409 : 500).json({
      success: false,
      message: error.code === 11000
        ? "এই মোবাইল নম্বরে অ্যাকাউন্ট আছে।"
        : "রেজিস্ট্রেশন সম্পন্ন হয়নি।"
    });
  }
});

// ============================================
// USER LOGIN
// ============================================

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

    const user = await User.findOne({ phone })
      .select("+passwordHash");

    if (!user || !user.passwordHash ||
        !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        success: false,
        message: "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়।"
      });
    }

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "লগইন করা যায়নি।"
        });
      }

      req.session.userId = user._id.toString();

      res.json({
        success: true,
        user: publicUser(user)
      });
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      success: false,
      message: "লগইন করা যায়নি।"
    });
  }
});

// ============================================
// CURRENT USER
// ============================================

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId)
      .select("name phone");

    if (!user) {
      return req.session.destroy(() => {
        res.status(401).json({
          success: false,
          message: "অ্যাকাউন্ট পাওয়া যায়নি।"
        });
      });
    }

    res.json({
      success: true,
      user: publicUser(user)
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "অ্যাকাউন্ট তথ্য পাওয়া যায়নি।"
    });
  }
});

// ============================================
// LOGOUT
// ============================================

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("rs_pay_session", {
      httpOnly: true,
      secure: production,
      sameSite: "lax"
    });

    res.json({ success: true });
  });
});

// ============================================
// PROFILE UPDATE
// ============================================

app.put("/api/account/profile", requireAuth, async (req, res) => {
  try {
    const name = clean(req.body.name, 60);

    if (name.length < 2) {
      return res.status(400).json({
        success: false,
        message: "সঠিক নাম লিখুন।"
      });
    }

    const user = await User.findByIdAndUpdate(
      req.session.userId,
      { $set: { name } },
      { new: true, runValidators: true }
    ).select("name phone");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "অ্যাকাউন্ট পাওয়া যায়নি।"
      });
    }

    res.json({
      success: true,
      user: publicUser(user)
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "প্রোফাইল আপডেট করা যায়নি।"
    });
  }
});

// ============================================
// PUBLIC WEBSITE CONTENT
// Compatible with existing app.js
// ============================================

app.get("/api/site-content", async (req, res) => {
  try {
    const doc = await SiteContent.findOne().lean();

    const content = doc || {};

    const banners = await Banner.find({
      enabled: true
    }).lean();

    const mappedBanners = banners.map(b => ({
      ...b,
      slot: b.slot || b.position,
      linkUrl: b.linkUrl || b.link || ""
    }));

    res.json({
      success: true,
      content: {
        ...content,
        landing: content.landing || {
          title: content.heroTitle || "",
          subtitle: content.heroSubtitle || "",
          buttonText: content.buttonText || ""
        }
      },
      banners: mappedBanners
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "ওয়েবসাইটের তথ্য লোড হয়নি।"
    });
  }
});

// ============================================
// EXISTING SERVICES
// No new categories are inserted.
// Existing collection data is preserved.
// ============================================

app.get("/api/services", async (req, res) => {
  try {
    const services = await Service.find({
      enabled: { $ne: false }
    }).sort({ order: 1, createdAt: 1 }).lean();

    res.json({
      success: true,
      services
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "সার্ভিস লোড করা যায়নি।"
    });
  }
});

// ============================================
// ADMIN LOGIN
// ============================================

app.post("/api/admin/login", adminLimiter, (req, res) => {
  const expected = Buffer.from(
    String(process.env.ADMIN_PASSWORD || "")
  );

  const supplied = Buffer.from(
    String(req.body.password || "")
  );

  if (
    !expected.length ||
    expected.length !== supplied.length ||
    !crypto.timingSafeEqual(expected, supplied)
  ) {
    return res.status(401).json({
      success: false,
      message: "অ্যাডমিন পাসওয়ার্ড সঠিক নয়।"
    });
  }

  req.session.regenerate(err => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "অ্যাডমিন সেশন তৈরি হয়নি।"
      });
    }

    req.session.adminAuthenticated = true;
    req.session.cookie.maxAge = 8 * 60 * 60 * 1000;

    res.json({ success: true });
  });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({
    success: true,
    authenticated: true
  });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("rs_pay_session", {
      httpOnly: true,
      secure: production,
      sameSite: "lax"
    });

    res.json({ success: true });
  });
});

// ============================================
// ADMIN CONTENT
// Matches existing admin.js:
// /api/admin/content
// ============================================

app.get("/api/admin/content", requireAdmin, async (req, res) => {
  try {
    const doc = await SiteContent.findOne().lean() || {};

    res.json({
      success: true,
      content: {
        ...doc,
        heroTitle:
          doc.heroTitle || doc.landing?.title || "",
        heroSubtitle:
          doc.heroSubtitle || doc.landing?.subtitle || ""
      }
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "কনটেন্ট পাওয়া যায়নি।"
    });
  }
});

app.put("/api/admin/content", requireAdmin, async (req, res) => {
  try {
    const heroTitle = clean(req.body.heroTitle, 180);
    const heroSubtitle = clean(req.body.heroSubtitle, 500);

    const doc = await SiteContent.findOneAndUpdate(
      {},
      {
        $set: {
          heroTitle,
          heroSubtitle,
          landing: {
            title: heroTitle,
            subtitle: heroSubtitle
          }
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    res.json({
      success: true,
      content: doc
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "কনটেন্ট সংরক্ষণ হয়নি।"
    });
  }
});

// ============================================
// ADMIN BANNERS
// Compatible with existing admin.js
// ============================================

app.get("/api/admin/banners", requireAdmin, async (req, res) => {
  try {
    const banners = await Banner.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, banners });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "ব্যানার লোড হয়নি।"
    });
  }
});

app.post("/api/admin/banners", requireAdmin, async (req, res) => {
  try {
    const imageUrl = validUrl(req.body.imageUrl || "");
    const link = validUrl(req.body.link || "");

    if (imageUrl === null || link === null) {
      return res.status(400).json({
        success: false,
        message: "সঠিক HTTP/HTTPS URL দিন।"
      });
    }

    const position = clean(req.body.position, 40);

    if (!["landing_top", "landing_middle", "dashboard_home"].includes(position)) {
      return res.status(400).json({
        success: false,
        message: "সঠিক Banner Position নির্বাচন করুন।"
      });
    }

    const banner = await Banner.create({
      title: clean(req.body.title, 100),
      description: clean(req.body.description, 300),
      imageUrl,
      link,
      linkUrl: link,
      position,
      slot: position,
      enabled: req.body.enabled === true
    });

    res.status(201).json({
      success: true,
      banner
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "ব্যানার তৈরি হয়নি।"
    });
  }
});

app.put("/api/admin/banners/:id", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Banner ID সঠিক নয়।"
      });
    }

    const imageUrl = validUrl(req.body.imageUrl || "");
    const link = validUrl(req.body.link || "");

    if (imageUrl === null || link === null) {
      return res.status(400).json({
        success: false,
        message: "সঠিক HTTP/HTTPS URL দিন।"
      });
    }

    const position = clean(req.body.position, 40);

    if (!["landing_top", "landing_middle", "dashboard_home"].includes(position)) {
      return res.status(400).json({
        success: false,
        message: "সঠিক Banner Position নির্বাচন করুন।"
      });
    }

    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          title: clean(req.body.title, 100),
          description: clean(req.body.description, 300),
          imageUrl,
          link,
          linkUrl: link,
          position,
          slot: position,
          enabled: req.body.enabled === true
        }
      },
      { new: true, runValidators: true }
    );

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner পাওয়া যায়নি।"
      });
    }

    res.json({ success: true, banner });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Banner আপডেট হয়নি।"
    });
  }
});

app.delete("/api/admin/banners/:id", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Banner ID সঠিক নয়।"
      });
    }

    await Banner.findByIdAndDelete(req.params.id);

    res.json({ success: true });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Banner মুছে ফেলা যায়নি।"
    });
  }
});

// ============================================
// ADMIN SERVICES
// Existing records are retained.
// ============================================

app.get("/api/admin/services", requireAdmin, async (req, res) => {
  try {
    const services = await Service.find()
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.json({ success: true, services });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "সার্ভিস লোড হয়নি।"
    });
  }
});

app.post("/api/admin/services", requireAdmin, async (req, res) => {
  try {
    const name = clean(req.body.name, 80);

    if (name.length < 2) {
      return res.status(400).json({
        success: false,
        message: "সার্ভিসের নাম দিন।"
      });
    }

    const service = await Service.create({
      key: makeKey(name) + "-" + crypto.randomBytes(3).toString("hex"),
      name,
      description: clean(req.body.description, 250),
      icon: clean(req.body.icon || "◇", 8),
      enabled: req.body.enabled !== false
    });

    res.status(201).json({
      success: true,
      service
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "সার্ভিস তৈরি হয়নি।"
    });
  }
});

app.put("/api/admin/services/:id", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Service ID সঠিক নয়।"
      });
    }

    const update = {
      name: clean(req.body.name, 80),
      description: clean(req.body.description, 250),
      icon: clean(req.body.icon || "◇", 8),
      enabled: req.body.enabled === true
    };

    if (update.name.length < 2) {
      return res.status(400).json({
        success: false,
        message: "সার্ভিসের নাম দিন।"
      });
    }

    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "সার্ভিস পাওয়া যায়নি।"
      });
    }

    res.json({ success: true, service });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "সার্ভিস আপডেট হয়নি।"
    });
  }
});

app.delete("/api/admin/services/:id", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Service ID সঠিক নয়।"
      });
    }

    await Service.findByIdAndDelete(req.params.id);

    res.json({ success: true });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "সার্ভিস মুছে ফেলা যায়নি।"
    });
  }
});

// ============================================
// ADMIN USERS
// ============================================

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select("name phone email createdAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      success: true,
      users: users.map(user => ({
        ...user,
        email: user.phone || user.email,
        role: "user"
      }))
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "ইউজার তালিকা পাওয়া যায়নি।"
    });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "RS PAY",
    database: mongoose.connection.readyState === 1
      ? "connected"
      : "disconnected"
  });
});

// ============================================
// STATIC WEBSITE
// ============================================

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  res.status(500).json({
    success: false,
    message: "সার্ভারে সমস্যা হয়েছে।"
  });
});

// ============================================
// START SERVER
// ============================================

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing");
    }

    if (!process.env.ADMIN_PASSWORD ||
        process.env.ADMIN_PASSWORD.length < 12) {
      throw new Error(
        "ADMIN_PASSWORD must contain at least 12 characters"
      );
    }

    await connectDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log("================================");
      console.log("RS PAY SERVER STARTED");
      console.log("PORT:", PORT);
      console.log("DATABASE: CONNECTED");
      console.log("================================");
    });

  } catch (error) {
    console.error("RS PAY STARTUP ERROR:", error.message);
    process.exit(1);
  }
}

startServer();
