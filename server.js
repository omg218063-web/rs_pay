
"use strict";

// ==========================================
// RS PAY - COMPLETE SERVER
// ==========================================

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
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  app.set("trust proxy", 1);
}

// ==========================================
// SECURITY AND BODY PARSER
// ==========================================

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

// ==========================================
// DATABASE MODELS
// ==========================================

// User Model
// Email field রাখা হয়েছে পুরোনো ডাটাবেসের
// compatibility বজায় রাখার জন্য।

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
    trim: true,
    maxlength: 14
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 150
  },

  passwordHash: {
    type: String,
    required: true,
    select: false
  }

}, { timestamps: true });

const User =
  mongoose.models.User ||
  mongoose.model("User", UserSchema);


// Website Content Model

const SiteContentSchema = new mongoose.Schema({
  key: {
    type: String,
    unique: true,
    default: "main"
  },

  landing: {
    title: {
      type: String,
      default: "পেমেন্ট, আরও সহজ।"
    },

    subtitle: {
      type: String,
      default: "মোবাইল রিচার্জ ও দৈনন্দিন বিল পেমেন্টের সেবাগুলো এক জায়গায় সাজানোর একটি স্মার্ট ডিজিটাল প্ল্যাটফর্ম।"
    },

    buttonText: {
      type: String,
      default: "শুরু করুন"
    }
  }

}, { timestamps: true });

const SiteContent =
  mongoose.models.SiteContent ||
  mongoose.model("SiteContent", SiteContentSchema);


// Banner Model

const BannerSchema = new mongoose.Schema({
  slot: {
    type: String,
    enum: [
      "landing_top",
      "landing_middle",
      "dashboard_home"
    ],
    unique: true,
    required: true
  },

  title: {
    type: String,
    maxlength: 100,
    default: ""
  },

  description: {
    type: String,
    maxlength: 400,
    default: ""
  },

  imageUrl: {
    type: String,
    maxlength: 1000,
    default: ""
  },

  linkUrl: {
    type: String,
    maxlength: 1000,
    default: ""
  },

  buttonText: {
    type: String,
    maxlength: 40,
    default: ""
  },

  enabled: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

const Banner =
  mongoose.models.Banner ||
  mongoose.model("Banner", BannerSchema);


// Service Category Model

const ServiceSchema = new mongoose.Schema({
  key: {
    type: String,
    unique: true,
    required: true,
    match: /^[a-z0-9_-]{2,40}$/
  },

  name: {
    type: String,
    required: true,
    maxlength: 60
  },

  description: {
    type: String,
    maxlength: 180,
    default: ""
  },

  icon: {
    type: String,
    maxlength: 8,
    default: "◇"
  },

  enabled: {
    type: Boolean,
    default: true
  },

  order: {
    type: Number,
    default: 0
  }

}, { timestamps: true });

const Service =
  mongoose.models.Service ||
  mongoose.model("Service", ServiceSchema);


// ==========================================
// SESSION SYSTEM
// ==========================================

const sessionSecret =
  process.env.SESSION_SECRET ||
  (!isProduction
    ? "local-development-only-change-this-secret"
    : "");

app.use(session({
  name: "rs_pay_session",

  secret: sessionSecret,

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
    secure: isProduction,
    sameSite: "lax",
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
}));


// ==========================================
// RATE LIMIT
// ==========================================

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
  }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "অনেকবার চেষ্টা হয়েছে। পরে আবার চেষ্টা করুন।"
  }
});


// ==========================================
// REQUEST PROTECTION
// ==========================================

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


// ==========================================
// HELPER FUNCTIONS
// ==========================================

function cleanText(value, maxLength) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function normalizePhone(value) {
  let digits = String(value || "")
    .replace(/[০-৯]/g, digit =>
      "০১২৩৪৫৬৭৮৯".indexOf(digit)
    )
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

  if (!/^01[3-9]\d{8}$/.test(digits)) {
    return null;
  }

  return digits;
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

function validWebUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(String(value));

    if (!["https:", "http:"].includes(url.protocol)) {
      return null;
    }

    return url.toString();

  } catch {
    return null;
  }
}

function publicUser(user) {
  return {
    name: user.name,
    phone: user.phone
  };
}


// ==========================================
// USER REGISTRATION
// First Name / Mobile Number / Password
// ==========================================

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = cleanText(req.body.name, 60);
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (name.length < 2) {
      return res.status(400).json({
        success: false,
        message: "আপনার নাম কমপক্ষে ২ অক্ষরের দিন।"
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

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "এই মোবাইল নম্বরে অ্যাকাউন্ট আগে থেকেই আছে।"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Internal unique email value preserves the
    // existing required email database field.
    const internalEmail = `${phone}@users.rs-pay.invalid`;

    const user = await User.create({
      name,
      phone,
      email: internalEmail,
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
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "এই মোবাইল নম্বরে অ্যাকাউন্ট আগে থেকেই আছে।"
      });
    }

    console.error("Registration error:", error);

    res.status(500).json({
      success: false,
      message: "অ্যাকাউন্ট তৈরি করা যায়নি। আবার চেষ্টা করুন।"
    });
  }
});


// ==========================================
// USER LOGIN
// ==========================================

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

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
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
      message: "লগইন করা যায়নি। আবার চেষ্টা করুন।"
    });
  }
});


// ==========================================
// CURRENT USER
// ==========================================

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


// ==========================================
// USER LOGOUT
// ==========================================

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("rs_pay_session", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax"
    });

    res.json({ success: true });
  });
});


// ==========================================
// ACCOUNT PROFILE UPDATE
// ==========================================

app.put("/api/account/profile", requireAuth, async (req, res) => {
  try {
    const name = cleanText(req.body.name, 60);

    if (name.length < 2) {
      return res.status(400).json({
        success: false,
        message: "নাম কমপক্ষে ২ অক্ষরের হতে হবে।"
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


// ==========================================
// PUBLIC WEBSITE CONTENT
// ==========================================

app.get("/api/site-content", async (req, res) => {
  try {
    const content = await SiteContent.findOne({
      key: "main"
    }).lean();

    const banners = await Banner.find({
      enabled: true
    }).lean();

    res.json({
      success: true,
      content: content || {},
      banners
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "ওয়েবসাইটের তথ্য লোড করা যায়নি।"
    });
  }
});


// ==========================================
// PUBLIC SERVICE CATEGORIES
// ==========================================

app.get("/api/services", async (req, res) => {
  try {
    const services = await Service.find({
      enabled: true
    })
      .sort({ order: 1, createdAt: 1 })
      .lean();

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


// ==========================================
// ADMIN LOGIN
// ==========================================

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
        message: "অ্যাডমিন সেশন তৈরি করা যায়নি।"
      });
    }

    req.session.adminAuthenticated = true;
    req.session.cookie.maxAge = 8 * 60 * 60 * 1000;

    res.json({
      success: true,
      message: "অ্যাডমিন লগইন সফল হয়েছে।"
    });
  });
});


// ==========================================
// ADMIN SESSION CHECK
// ==========================================

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({
    success: true,
    authenticated: true
  });
});


// ==========================================
// ADMIN LOGOUT
// ==========================================

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("rs_pay_session", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax"
    });

    res.json({ success: true });
  });
});


// ==========================================
// ADMIN DASHBOARD STATS
// ==========================================

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const [totalUsers, serviceCount, bannerCount] =
      await Promise.all([
        User.countDocuments(),
        Service.countDocuments({ enabled: true }),
        Banner.countDocuments({ enabled: true })
      ]);

    res.json({
      success: true,
      totalUsers,
      serviceCount,
      bannerCount
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Dashboard তথ্য পাওয়া যায়নি।"
    });
  }
});


// ==========================================
// ADMIN USER LIST
// ==========================================

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select("name phone createdAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      success: true,
      users
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "ইউজার তালিকা পাওয়া যায়নি।"
    });
  }
});


// ==========================================
// ADMIN WEBSITE CONTENT
// ==========================================

app.get("/api/admin/site-content", requireAdmin, async (req, res) => {
  try {
    const content = await SiteContent.findOne({
      key: "main"
    }).lean();

    res.json({
      success: true,
      content: content || {}
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "কনটেন্ট পাওয়া যায়নি।"
    });
  }
});


app.put("/api/admin/site-content", requireAdmin, async (req, res) => {
  try {
    const landing = req.body.landing || {};

    const content = await SiteContent.findOneAndUpdate(
      { key: "main" },
      {
        $set: {
          landing: {
            title: cleanText(landing.title, 100),
            subtitle: cleanText(landing.subtitle, 400),
            buttonText: cleanText(landing.buttonText, 40)
          }
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    res.json({
      success: true,
      content
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "কনটেন্ট সংরক্ষণ করা যায়নি।"
    });
  }
});


// ==========================================
// ADMIN BANNERS
// ==========================================

app.get("/api/admin/banners", requireAdmin, async (req, res) => {
  try {
    const banners = await Banner.find()
      .sort({ slot: 1 })
      .lean();

    res.json({
      success: true,
      banners
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "ব্যানার পাওয়া যায়নি।"
    });
  }
});


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
        message: "ব্যানারের অবস্থান সঠিক নয়।"
      });
    }

    const imageUrl = validWebUrl(req.body.imageUrl || "");
    const linkUrl = validWebUrl(req.body.linkUrl || "");

    if (imageUrl === null || linkUrl === null) {
      return res.status(400).json({
        success: false,
        message: "শুধু HTTP বা HTTPS লিংক ব্যবহার করুন।"
      });
    }

    const banner = await Banner.findOneAndUpdate(
      { slot: req.params.slot },
      {
        $set: {
          title: cleanText(req.body.title, 100),
          description: cleanText(req.body.description, 400),
          imageUrl,
          linkUrl,
          buttonText: cleanText(req.body.buttonText, 40),
          enabled: req.body.enabled === true
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    res.json({
      success: true,
      banner
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "ব্যানার সংরক্ষণ করা যায়নি।"
    });
  }
});


// ==========================================
// ADMIN SERVICE MANAGEMENT
// ==========================================

app.get("/api/admin/services", requireAdmin, async (req, res) => {
  try {
    const services = await Service.find()
      .sort({ order: 1 })
      .lean();

    res.json({
      success: true,
      services
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "সার্ভিস তালিকা পাওয়া যায়নি।"
    });
  }
});


app.post("/api/admin/services", requireAdmin, async (req, res) => {
  try {
    const key = cleanText(req.body.key, 40).toLowerCase();
    const name = cleanText(req.body.name, 60);

    if (!/^[a-z0-9_-]{2,40}$/.test(key) || name.length < 2) {
      return res.status(400).json({
        success: false,
        message: "ক্যাটাগরির Key ও নাম সঠিকভাবে দিন।"
      });
    }

    const service = await Service.create({
      key,
      name,
      description: cleanText(req.body.description, 180),
      icon: cleanText(req.body.icon || "◇", 8),
      enabled: req.body.enabled !== false,
      order: Number.isFinite(Number(req.body.order))
        ? Number(req.body.order)
        : 0
    });

    res.status(201).json({
      success: true,
      service
    });

  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({
      success: false,
      message: error.code === 11000
        ? "এই Key আগে থেকেই আছে।"
        : "ক্যাটাগরি তৈরি করা যায়নি।"
    });
  }
});


app.put("/api/admin/services/:id", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "ক্যাটাগরি ID সঠিক নয়।"
      });
    }

    const update = {};

    if (req.body.name !== undefined) {
      update.name = cleanText(req.body.name, 60);
    }

    if (req.body.description !== undefined) {
      update.description = cleanText(req.body.description, 180);
    }

    if (req.body.icon !== undefined) {
      update.icon = cleanText(req.body.icon, 8);
    }

    if (req.body.enabled !== undefined) {
      update.enabled = req.body.enabled === true;
    }

    if (
      req.body.order !== undefined &&
      Number.isFinite(Number(req.body.order))
    ) {
      update.order = Number(req.body.order);
    }

    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "ক্যাটাগরি পাওয়া যায়নি।"
      });
    }

    res.json({
      success: true,
      service
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "ক্যাটাগরি আপডেট করা যায়নি।"
    });
  }
});


app.delete("/api/admin/services/:id", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "ক্যাটাগরি ID সঠিক নয়।"
      });
    }

    await Service.findByIdAndDelete(req.params.id);

    res.json({ success: true });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "ক্যাটাগরি মুছে ফেলা যায়নি।"
    });
  }
});


// ==========================================
// HEALTH CHECK
// ==========================================

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


// ==========================================
// STATIC WEBSITE FILES
// ==========================================

app.use(express.static(
  path.join(__dirname, "public")
));

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});


// ==========================================
// DEFAULT WEBSITE DATA
// ==========================================

async function seedDefaults() {
  if (!(await SiteContent.exists({ key: "main" }))) {
    await SiteContent.create({
      key: "main",
      landing: {
        title: "পেমেন্ট, আরও সহজ।",
        subtitle: "মোবাইল রিচার্জ ও দৈনন্দিন বিল পেমেন্টের সেবাগুলো এক জায়গায় সাজানোর একটি স্মার্ট ডিজিটাল প্ল্যাটফর্ম।",
        buttonText: "শুরু করুন"
      }
    });
  }

  if (await Service.countDocuments() === 0) {
    await Service.insertMany([
      {
        key: "mobile",
        name: "মোবাইল রিচার্জ",
        description: "GP, Robi, Airtel, Banglalink ও Teletalk",
        icon: "▣",
        order: 1
      },
      {
        key: "electricity",
        name: "বিদ্যুৎ বিল",
        description: "বিদ্যুৎ বিল পেমেন্টের সেবা বিভাগ",
        icon: "ϟ",
        order: 2
      },
      {
        key: "gas",
        name: "গ্যাস বিল",
        description: "গ্যাস বিল পেমেন্টের সেবা বিভাগ",
        icon: "♨",
        order: 3
      },
      {
        key: "water",
        name: "পানি বিল",
        description: "WASA ও পানি বিল পেমেন্ট",
        icon: "◉",
        order: 4
      },
      {
        key: "internet",
        name: "ইন্টারনেট বিল",
        description: "ব্রডব্যান্ড ও ISP পেমেন্ট",
        icon: "⌁",
        order: 5
      },
      {
        key: "tv",
        name: "টিভি সার্ভিস",
        description: "টিভি সাবস্ক্রিপশন বিভাগ",
        icon: "▤",
        order: 6
      },
      {
        key: "education",
        name: "শিক্ষা ফি",
        description: "শিক্ষাপ্রতিষ্ঠানের ফি বিভাগ",
        icon: "⌂",
        order: 7
      },
      {
        key: "more",
        name: "আরও সেবা",
        description: "ভবিষ্যতে নতুন সেবা যুক্ত হবে",
        icon: "＋",
        order: 8
      }
    ]);
  }
}


// ==========================================
// START SERVER
// ==========================================

async function startServer() {
  try {
    if (
      isProduction &&
      (
        !process.env.SESSION_SECRET ||
        process.env.SESSION_SECRET.length < 32
      )
    ) {
      throw new Error(
        "SESSION_SECRET must be at least 32 characters in production"
      );
    }

    if (
      !process.env.ADMIN_PASSWORD ||
      process.env.ADMIN_PASSWORD.length < 12
    ) {
      throw new Error(
        "Set ADMIN_PASSWORD to a strong value of at least 12 characters"
      );
    }

    await connectDatabase();

    await seedDefaults();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`RS PAY running on port ${PORT}`);
    });

  } catch (error) {
    console.error(
      "Server startup failed:",
      error.message
    );

    process.exit(1);
  }
}

startServer();
