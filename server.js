const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDatabase = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
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
    required: true
  }
}, { timestamps: true });

const User = mongoose.models.User ||
  mongoose.model("User", UserSchema);

app.use(session({
  name: "rs_pay_session",
  secret: process.env.SESSION_SECRET ||
    (isProduction ? "" : "local-development-only-change-this"),
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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
  }
});

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "প্রথমে লগইন করুন।"
    });
  }
  next();
}

// Registration
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({
        success: false,
        message: "নাম ২ থেকে ৬০ অক্ষরের মধ্যে দিন।"
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 150) {
      return res.status(400).json({
        success: false,
        message: "সঠিক ইমেইল ঠিকানা দিন।"
      });
    }

    if (password.length < 10 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।"
      });
    }

    const exists = await User.findOne({ email });

    if (exists) {
      return res.status(409).json({
        success: false,
        message: "এই ইমেইল দিয়ে অ্যাকাউন্ট আগে থেকেই আছে।"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      passwordHash
    });

    req.session.userId = user._id.toString();
    req.session.userName = user.name;

    res.status(201).json({
      success: true,
      user: {
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "এই ইমেইল দিয়ে অ্যাকাউন্ট আগে থেকেই আছে।"
      });
    }

    console.error("Registration error:", error.message);

    res.status(500).json({
      success: false,
      message: "অ্যাকাউন্ট তৈরি করা যায়নি। আবার চেষ্টা করুন।"
    });
  }
});

// Login
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        success: false,
        message: "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।"
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "লগইন করা যায়নি। আবার চেষ্টা করুন।"
        });
      }

      req.session.userId = user._id.toString();
      req.session.userName = user.name;

      res.json({
        success: true,
        user: {
          name: user.name,
          email: user.email
        }
      });
    });

  } catch (error) {
    console.error("Login error:", error.message);

    res.status(500).json({
      success: false,
      message: "লগইন করা যায়নি। আবার চেষ্টা করুন।"
    });
  }
});

// Current logged-in user
app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId)
    .select("name email");

  if (!user) {
    return req.session.destroy(() => {
      res.status(401).json({ success: false });
    });
  }

  res.json({
    success: true,
    user: {
      name: user.name,
      email: user.email
    }
  });
});

// Logout
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

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "RS PAY",
    database: mongoose.connection.readyState === 1
      ? "connected"
      : "disconnected"
  });
});

// Services list
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

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
async function startServer() {
  try {
    if (
      isProduction &&
      (!process.env.SESSION_SECRET ||
       process.env.SESSION_SECRET.length < 32)
    ) {
      throw new Error(
        "SESSION_SECRET must be at least 32 characters"
      );
    }

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
