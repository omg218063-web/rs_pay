"use strict";

const express = require("express");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");

const connectDatabase = require("./database");
const { seedIfNeeded } = require("./lib/settings");

const app = express();
const PORT = process.env.PORT || 3000;
const production = process.env.NODE_ENV === "production";

if (production) app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));

app.use(express.json({ limit: "3mb" }));

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

// CSRF guard: every state-changing API call must come from our own frontend.
app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("X-Requested-With") !== "rspay") return res.status(403).json({ error: "Forbidden" });
  next();
});

app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/api", require("./routes/public"));
app.use("/api", require("./routes/user"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

app.get("/health", (req, res) => res.json({ ok: true }));

// ---- pages ----
const pub = path.join(__dirname, "public");
app.use(express.static(pub, { extensions: ["html"], maxAge: production ? "1h" : 0 }));
const page = (file) => (req, res) => res.sendFile(path.join(pub, file));
app.get("/login", page("login.html"));
app.get("/app", page("app.html"));
app.get("/admin", page("admin.html"));
app.get("*", page("index.html"));

// ---- errors ----
app.use((err, req, res, next) => {
  const status = err.status || (err.type === "entity.too.large" ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "সার্ভারে সমস্যা হয়েছে। আবার চেষ্টা করুন।" : err.message });
});

connectDatabase()
  .then(seedIfNeeded)
  .then(() => app.listen(PORT, () => console.log(`RS PAY running on port ${PORT}`)))
  .catch((err) => {
    console.error("Startup failed:", err.message);
    process.exit(1);
  });
