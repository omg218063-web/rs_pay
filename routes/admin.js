"use strict";

const router = require("express").Router();
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const {
  User, Package, Service, Banner, Order, Deposit, WalletTx, Media, credit
} = require("../lib/models");
const { getSite, saveSite } = require("../lib/settings");
const providers = require("../lib/providers");
const {
  wrap, money, str, isId, bool, int, escRe, httpError
} = require("../lib/util");

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: "অনেকবার ভুল চেষ্টা। ১৫ মিনিট পর আবার চেষ্টা করুন।" }
});

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: "অ্যাডমিন লগইন প্রয়োজন" });
  next();
}

router.post("/login", adminLimiter, (req, res) => {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass || pass.length < 12) return res.status(500).json({ error: "ADMIN_PASSWORD সেট করা নেই (কমপক্ষে ১২ অক্ষর)" });
  if (!safeEqual(req.body && req.body.password, pass)) return res.status(401).json({ error: "পাসওয়ার্ড ভুল" });
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "সার্ভার সমস্যা" });
    req.session.isAdmin = true;
    res.json({ ok: true });
  });
});

router.get("/me", requireAdmin, (req, res) => res.json({ ok: true, providerMode: providers.mode() }));

router.post("/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("rs_pay_session");
    res.json({ ok: true });
  });
});

router.use(requireAdmin);

// ---------------- DASHBOARD ----------------

router.get("/stats", wrap(async (req, res) => {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const since = new Date(Date.now() - 6 * 86400000);
  since.setHours(0, 0, 0, 0);

  const [users, balAgg, ordersToday, revToday, pendingDeposits, processing, failedToday, daily, byType, recent] =
    await Promise.all([
      User.countDocuments(),
      User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]),
      Order.countDocuments({ createdAt: { $gte: startToday } }),
      Order.aggregate([{ $match: { status: "success", createdAt: { $gte: startToday } } }, { $group: { _id: null, t: { $sum: "$total" } } }]),
      Deposit.countDocuments({ status: "pending" }),
      Order.countDocuments({ status: "processing" }),
      Order.countDocuments({ status: "failed", createdAt: { $gte: startToday } }),
      Order.aggregate([
        { $match: { status: "success", createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Dhaka" } }, total: { $sum: "$total" }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Order.aggregate([{ $match: { status: "success" } }, { $group: { _id: "$type", total: { $sum: "$total" }, count: { $sum: 1 } } }]),
      Order.find().sort({ createdAt: -1 }).limit(8).populate("user", "name phone").lean()
    ]);

  res.json({
    users,
    walletTotal: (balAgg[0] && balAgg[0].total) || 0,
    ordersToday,
    revenueToday: (revToday[0] && revToday[0].t) || 0,
    pendingDeposits,
    processing,
    failedToday,
    daily,
    byType,
    recent,
    providerMode: providers.mode()
  });
}));

// ---------------- USERS ----------------

router.get("/users", wrap(async (req, res) => {
  const page = int(req.query.page, 1, 1, 10000);
  const limit = 20;
  const q = {};
  const s = str(req.query.q, 40);
  if (s) q.$or = [{ name: new RegExp(escRe(s), "i") }, { phone: new RegExp(escRe(s)) }];
  const [items, total] = await Promise.all([
    User.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(q)
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

router.patch("/users/:id", wrap(async (req, res) => {
  if (!isId(req.params.id)) throw httpError(404, "ইউজার পাওয়া যায়নি");
  const set = {};
  if (["active", "blocked"].includes(req.body.status)) set.status = req.body.status;
  if (typeof req.body.name === "string" && str(req.body.name, 60).length >= 2) set.name = str(req.body.name, 60);
  const u = await User.findByIdAndUpdate(req.params.id, set, { new: true }).lean();
  if (!u) throw httpError(404, "ইউজার পাওয়া যায়নি");
  res.json({ user: u });
}));

// Manual wallet credit / debit
router.post("/users/:id/adjust", wrap(async (req, res) => {
  if (!isId(req.params.id)) throw httpError(404, "ইউজার পাওয়া যায়নি");
  const amount = money(req.body.amount);
  const note = str(req.body.note, 120) || "Admin adjustment";
  if (!amount || Math.abs(amount) > 1000000) throw httpError(400, "সঠিক পরিমাণ দিন");
  if (amount < 0) {
    const u = await User.findOneAndUpdate(
      { _id: req.params.id, balance: { $gte: -amount } },
      { $inc: { balance: amount } }, { new: true }
    );
    if (!u) throw httpError(400, "ইউজারের ব্যালেন্স কম");
    await WalletTx.create({ user: u._id, kind: "adjust", amount, balanceAfter: u.balance, note });
    return res.json({ balance: u.balance });
  }
  const u = await credit(req.params.id, amount, "adjust", "", note);
  if (!u) throw httpError(404, "ইউজার পাওয়া যায়নি");
  res.json({ balance: u.balance });
}));

// ---------------- ORDERS ----------------

router.get("/orders", wrap(async (req, res) => {
  const page = int(req.query.page, 1, 1, 10000);
  const limit = 25;
  const q = {};
  if (["processing", "success", "failed", "refunded"].includes(req.query.status)) q.status = req.query.status;
  if (["recharge", "package", "freefire", "bill"].includes(req.query.type)) q.type = req.query.type;
  const s = str(req.query.q, 40);
  if (s) q.$or = [{ orderNo: new RegExp(escRe(s), "i") }, { target: new RegExp(escRe(s)) }];
  const [items, total] = await Promise.all([
    Order.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("user", "name phone").lean(),
    Order.countDocuments(q)
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

// action: success | fail (refund) | refund (after success)
router.patch("/orders/:id", wrap(async (req, res) => {
  if (!isId(req.params.id)) throw httpError(404, "অর্ডার পাওয়া যায়নি");
  const { action } = req.body;
  const note = str(req.body.note, 160);
  const ref = str(req.body.providerRef, 60);
  const rules = {
    success: { from: ["processing"], to: "success", refund: false },
    fail: { from: ["processing"], to: "failed", refund: true },
    refund: { from: ["success"], to: "refunded", refund: true }
  };
  const r = rules[action];
  if (!r) throw httpError(400, "অ্যাকশন সঠিক নয়");

  // Atomic status change: only one request can ever win, so refunds can never double up.
  const set = { status: r.to };
  if (note) set.note = note;
  if (ref) set.providerRef = ref;
  const o = await Order.findOneAndUpdate(
    { _id: req.params.id, status: { $in: r.from } }, set, { new: true }
  );
  if (!o) throw httpError(409, "এই অর্ডারের স্ট্যাটাস আগেই বদলে গেছে");
  if (r.refund) await credit(o.user, o.total, "refund", o.orderNo, note || "Admin refund");
  res.json({ order: o });
}));

// ---------------- DEPOSITS ----------------

router.get("/deposits", wrap(async (req, res) => {
  const q = {};
  if (["pending", "approved", "rejected"].includes(req.query.status)) q.status = req.query.status;
  const items = await Deposit.find(q).sort({ createdAt: -1 }).limit(100).populate("user", "name phone").lean();
  res.json({ items });
}));

router.patch("/deposits/:id", wrap(async (req, res) => {
  if (!isId(req.params.id)) throw httpError(404, "রিকোয়েস্ট পাওয়া যায়নি");
  const { action } = req.body;
  const note = str(req.body.note, 120);
  if (!["approve", "reject"].includes(action)) throw httpError(400, "অ্যাকশন সঠিক নয়");

  const d = await Deposit.findOneAndUpdate(
    { _id: req.params.id, status: "pending" },
    { status: action === "approve" ? "approved" : "rejected", note },
    { new: true }
  );
  if (!d) throw httpError(409, "রিকোয়েস্টটি আগেই প্রসেস হয়েছে");

  if (action === "approve") {
    await credit(d.user, d.amount, "deposit", d.trxId, d.method);
    // one-time referral bonus on the referred user's first approved deposit
    const site = await getSite();
    const bonus = site.referral.bonus;
    if (bonus > 0) {
      const claimed = await User.findOneAndUpdate(
        { _id: d.user, refBonusPaid: false, referredBy: { $ne: null } },
        { refBonusPaid: true }, { new: true }
      );
      if (claimed) await credit(claimed.referredBy, bonus, "bonus", String(d.user), "Referral bonus");
    }
  }
  res.json({ deposit: d });
}));

// ---------------- generic CRUD ----------------

function crud(path, Model, pick, sortBy) {
  router.get(path, wrap(async (req, res) => {
    res.json({ items: await Model.find().sort(sortBy).lean() });
  }));
  router.post(path, wrap(async (req, res) => {
    try { res.status(201).json({ item: await Model.create(pick(req.body)) }); }
    catch (e) { throw toHttp(e); }
  }));
  router.put(path + "/:id", wrap(async (req, res) => {
    if (!isId(req.params.id)) throw httpError(404, "পাওয়া যায়নি");
    try {
      const item = await Model.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true }).lean();
      if (!item) throw httpError(404, "পাওয়া যায়নি");
      res.json({ item });
    } catch (e) { throw toHttp(e); }
  }));
  router.delete(path + "/:id", wrap(async (req, res) => {
    if (!isId(req.params.id)) throw httpError(404, "পাওয়া যায়নি");
    await Model.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  }));
}

function toHttp(e) {
  if (e.status) return e;
  if (e.code === 11000) return httpError(409, "এই কী/নাম আগেই আছে");
  if (e.name === "ValidationError") return httpError(400, "তথ্য সঠিক নয়: " + Object.keys(e.errors).join(", "));
  return e;
}

crud("/packages", Package, (b) => ({
  type: ["internet", "minute", "combo", "freefire"].includes(b.type) ? b.type : "internet",
  operator: str(b.operator, 16).toLowerCase(),
  title: str(b.title, 80),
  detail: str(b.detail, 160),
  validity: str(b.validity, 40),
  price: money(b.price),
  oldPrice: money(b.oldPrice) || 0,
  tag: str(b.tag, 24),
  code: str(b.code, 80),
  active: bool(b.active, true),
  sort: int(b.sort, 0)
}), { type: 1, operator: 1, sort: 1, price: 1 });

crud("/services", Service, (b) => ({
  key: str(b.key, 30).toLowerCase().replace(/[^a-z0-9_-]/g, ""),
  name: str(b.name, 60),
  nameEn: str(b.nameEn, 60),
  icon: str(b.icon, 8) || "💡",
  accountLabel: str(b.accountLabel, 60) || "Account No.",
  min: int(b.min, 10, 1),
  max: int(b.max, 50000, 1),
  feePercent: Math.min(20, Math.max(0, Number(b.feePercent) || 0)),
  code: str(b.code, 80),
  active: bool(b.active, true),
  sort: int(b.sort, 0)
}), { sort: 1 });

crud("/banners", Banner, (b) => ({
  title: str(b.title, 80),
  text: str(b.text, 160),
  imageId: isId(b.imageId) ? String(b.imageId) : "",
  link: /^(\/|https:\/\/)/.test(str(b.link, 300)) ? str(b.link, 300) : "",
  style: int(b.style, 1, 1, 5),
  placement: b.placement === "landing" ? "landing" : "app",
  active: bool(b.active, true),
  sort: int(b.sort, 0)
}), { sort: 1, createdAt: -1 });

// ---------------- SITE SETTINGS + MEDIA ----------------

router.get("/site", wrap(async (req, res) => res.json({ site: await getSite() })));
router.put("/site", wrap(async (req, res) => res.json({ site: await saveSite(req.body) })));

router.post("/media", wrap(async (req, res) => {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.dataUrl || ""));
  if (!m) throw httpError(400, "শুধু PNG, JPG বা WEBP ছবি দিন");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 1.5 * 1024 * 1024) throw httpError(413, "ছবি ১.৫ MB এর কম হতে হবে");
  const doc = await Media.create({ contentType: m[1], data: buf, size: buf.length });
  res.status(201).json({ id: String(doc._id), url: "/api/media/" + doc._id });
}));

module.exports = router;
