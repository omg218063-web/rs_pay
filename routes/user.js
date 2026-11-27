"use strict";

const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const {
  User, Package, Service, Order, Deposit, WalletTx, credit, debit
} = require("../lib/models");
const { getSite } = require("../lib/settings");
const providers = require("../lib/providers");
const {
  wrap, money, str, normPhone, isPhone, isId, int, orderNo, httpError
} = require("../lib/util");

const limiter = (max, minutes, message) => rateLimit({
  windowMs: minutes * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message }
});
const authLimiter = limiter(15, 15, "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।");
const orderLimiter = limiter(30, 10, "অনেক দ্রুত অর্ডার করা হচ্ছে। একটু অপেক্ষা করুন।");

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "লগইন করুন" });
  next();
}

const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  phone: u.phone,
  email: u.email && !u.email.endsWith("@rspay.local") ? u.email : "",
  balance: u.balance || 0,
  referralCode: u.referralCode || "",
  createdAt: u.createdAt
});

async function ensureReferralCode(u) {
  if (u.referralCode) return u;
  for (let i = 0; i < 5; i++) {
    const code = "RS" + crypto.randomBytes(3).toString("hex").toUpperCase();
    try {
      return await User.findByIdAndUpdate(u._id, { referralCode: code }, { new: true });
    } catch (e) { if (e.code !== 11000) throw e; }
  }
  return u;
}

// ---------------- AUTH ----------------

router.post("/auth/register", authLimiter, wrap(async (req, res) => {
  const site = await getSite();
  if (site.maintenance.active) throw httpError(503, site.maintenance.message);
  const b = req.body || {};
  const name = str(b.name, 60);
  const phone = normPhone(b.phone);
  const password = typeof b.password === "string" ? b.password : "";
  let email = str(b.email, 80).toLowerCase();

  if (name.length < 2) throw httpError(400, "নাম লিখুন");
  if (!isPhone(phone)) throw httpError(400, "সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)");
  if (password.length < 6 || password.length > 72) throw httpError(400, "পাসওয়ার্ড ৬-৭২ অক্ষরের হতে হবে");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "ইমেইল সঠিক নয়");
  if (!email) email = phone + "@rspay.local"; // keeps compatibility with the old unique email index

  let referredBy = null;
  const ref = str(b.ref, 12).toUpperCase();
  if (ref) {
    const r = await User.findOne({ referralCode: ref }).select("_id").lean();
    if (r) referredBy = r._id;
  }

  try {
    const u = await User.create({
      name, phone, email,
      passwordHash: await bcrypt.hash(password, 11),
      referredBy
    });
    await ensureReferralCode(u);
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "সার্ভার সমস্যা" });
      req.session.userId = String(u._id);
      res.status(201).json({ ok: true });
    });
  } catch (e) {
    if (e.code === 11000) throw httpError(409, "এই নম্বর বা ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে");
    throw e;
  }
}));

router.post("/auth/login", authLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const id = str(b.phone, 80);
  const password = typeof b.password === "string" ? b.password : "";
  const phone = normPhone(id);
  const u = await User.findOne(
    isPhone(phone) ? { phone } : { email: id.toLowerCase() }
  ).select("+passwordHash");

  const ok = u && u.passwordHash && (await bcrypt.compare(password, u.passwordHash));
  if (!ok) throw httpError(401, "মোবাইল নম্বর বা পাসওয়ার্ড ভুল");
  if (u.status === "blocked") throw httpError(403, "আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ আছে");

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "সার্ভার সমস্যা" });
    req.session.userId = String(u._id);
    res.json({ ok: true });
  });
}));

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("rs_pay_session");
    res.json({ ok: true });
  });
});

// ---------------- ACCOUNT ----------------

router.get("/me", requireAuth, wrap(async (req, res) => {
  let u = await User.findById(req.session.userId);
  if (!u || u.status === "blocked") {
    return req.session.destroy(() => res.status(401).json({ error: "লগইন করুন" }));
  }
  u = await ensureReferralCode(u);
  User.updateOne({ _id: u._id }, { lastSeen: new Date() }).catch(() => {});
  res.json({ user: publicUser(u) });
}));

router.put("/me", requireAuth, wrap(async (req, res) => {
  const name = str(req.body.name, 60);
  let email = str(req.body.email, 80).toLowerCase();
  if (name.length < 2) throw httpError(400, "নাম লিখুন");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "ইমেইল সঠিক নয়");
  const cur = await User.findById(req.session.userId);
  if (!email) email = cur.phone + "@rspay.local";
  try {
    const u = await User.findByIdAndUpdate(req.session.userId, { name, email }, { new: true });
    res.json({ user: publicUser(u) });
  } catch (e) {
    if (e.code === 11000) throw httpError(409, "এই ইমেইল আগেই ব্যবহার হয়েছে");
    throw e;
  }
}));

router.put("/me/password", requireAuth, authLimiter, wrap(async (req, res) => {
  const { current, next } = req.body || {};
  if (typeof next !== "string" || next.length < 6 || next.length > 72) {
    throw httpError(400, "নতুন পাসওয়ার্ড ৬-৭২ অক্ষরের হতে হবে");
  }
  const u = await User.findById(req.session.userId).select("+passwordHash");
  if (!(await bcrypt.compare(String(current || ""), u.passwordHash))) {
    throw httpError(400, "বর্তমান পাসওয়ার্ড ভুল");
  }
  u.passwordHash = await bcrypt.hash(next, 11);
  await u.save();
  res.json({ ok: true });
}));

// ---------------- ORDERS ----------------

function detectOperator(phone) {
  const p = phone.slice(0, 3);
  return { "017": "gp", "013": "gp", "019": "bl", "014": "bl", "018": "robi", "016": "airtel", "015": "teletalk" }[p] || "";
}

router.post("/orders", requireAuth, orderLimiter, wrap(async (req, res) => {
  const site = await getSite();
  if (site.maintenance.active) throw httpError(503, site.maintenance.message);

  const b = req.body || {};
  const ops = site.operators.filter((o) => o.active).map((o) => o.id);
  let { type } = b;
  let amount = 0, fee = 0, title = "", target = "", code = "", operator = "";
  const meta = {};

  if (type === "recharge") {
    target = normPhone(b.target);
    if (!isPhone(target)) throw httpError(400, "সঠিক মোবাইল নম্বর দিন");
    operator = ops.includes(b.operator) ? b.operator : detectOperator(target);
    if (!operator || !ops.includes(operator)) throw httpError(400, "অপারেটর নির্বাচন করুন");
    amount = int(b.amount, 0);
    const { minRecharge, maxRecharge } = site.orders;
    if (amount < minRecharge || amount > maxRecharge) {
      throw httpError(400, `রিচার্জ পরিমাণ ৳${minRecharge} - ৳${maxRecharge} এর মধ্যে হতে হবে`);
    }
    meta.simType = b.simType === "postpaid" ? "postpaid" : "prepaid";
    title = "মোবাইল রিচার্জ";
  } else if (type === "package" || type === "freefire") {
    if (!isId(b.packageId)) throw httpError(400, "প্যাকেজ নির্বাচন করুন");
    const pkg = await Package.findOne({ _id: b.packageId, active: true }).lean();
    if (!pkg) throw httpError(404, "প্যাকেজটি পাওয়া যায়নি");
    if ((type === "freefire") !== (pkg.type === "freefire")) throw httpError(400, "প্যাকেজ মিলছে না");
    if (type === "freefire") {
      target = str(b.target, 20);
      if (!/^\d{5,15}$/.test(target)) throw httpError(400, "সঠিক Free Fire UID দিন");
    } else {
      target = normPhone(b.target);
      if (!isPhone(target)) throw httpError(400, "সঠিক মোবাইল নম্বর দিন");
    }
    amount = pkg.price;
    title = pkg.title;
    code = pkg.code;
    operator = pkg.operator;
    meta.packageType = pkg.type;
  } else if (type === "bill") {
    const svc = await Service.findOne({ key: str(b.service, 30), active: true }).lean();
    if (!svc) throw httpError(404, "সার্ভিসটি পাওয়া যায়নি");
    target = str(b.target, 40);
    if (target.length < 3) throw httpError(400, svc.accountLabel + " দিন");
    amount = int(b.amount, 0);
    if (amount < svc.min || amount > svc.max) {
      throw httpError(400, `পরিমাণ ৳${svc.min} - ৳${svc.max} এর মধ্যে হতে হবে`);
    }
    fee = money((amount * svc.feePercent) / 100);
    title = svc.name;
    code = svc.code;
    meta.service = svc.key;
    meta.contact = str(b.contact, 20);
  } else {
    throw httpError(400, "অর্ডারের ধরন সঠিক নয়");
  }

  const total = money(amount + fee);
  const no = orderNo();

  const after = await debit(req.session.userId, total, "purchase", no, title);
  if (!after) {
    const u = await User.findById(req.session.userId).select("status").lean();
    if (u && u.status === "blocked") throw httpError(403, "আপনার অ্যাকাউন্ট বন্ধ আছে");
    throw httpError(402, "ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই");
  }

  let order;
  try {
    order = await Order.create({
      orderNo: no, user: req.session.userId, type, title, operator, target,
      amount, fee, total, code, meta
    });
  } catch (e) {
    await credit(req.session.userId, total, "refund", no, "Order create failed");
    throw e;
  }

  const result = await providers.execute(order);

  if (result.status === "failed") {
    const upd = await Order.findOneAndUpdate(
      { _id: order._id, status: "processing" },
      { status: "failed", note: result.message, providerRef: result.ref },
      { new: true }
    );
    if (upd) await credit(req.session.userId, total, "refund", no, "Auto refund: " + result.message);
    order = upd || order;
  } else if (result.status === "success") {
    order = await Order.findOneAndUpdate(
      { _id: order._id, status: "processing" },
      { status: "success", note: result.message, providerRef: result.ref },
      { new: true }
    ) || order;
  } else {
    order.providerRef = result.ref;
    order.note = result.message;
    await order.save();
  }

  const fresh = await User.findById(req.session.userId).select("balance").lean();
  res.status(201).json({ order, balance: fresh.balance });
}));

router.get("/orders", requireAuth, wrap(async (req, res) => {
  const q = { user: req.session.userId };
  if (["recharge", "package", "freefire", "bill"].includes(req.query.type)) q.type = req.query.type;
  const limit = int(req.query.limit, 30, 1, 100);
  const items = await Order.find(q).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ items });
}));

// ---------------- WALLET ----------------

router.get("/wallet/methods", requireAuth, wrap(async (req, res) => {
  const site = await getSite();
  res.json({
    methods: site.payment.methods.filter((m) => m.active),
    min: site.payment.minDeposit,
    max: site.payment.maxDeposit
  });
}));

router.get("/wallet/history", requireAuth, wrap(async (req, res) => {
  const items = await WalletTx.find({ user: req.session.userId })
    .sort({ createdAt: -1 }).limit(int(req.query.limit, 50, 1, 100)).lean();
  res.json({ items });
}));

router.get("/deposits", requireAuth, wrap(async (req, res) => {
  const items = await Deposit.find({ user: req.session.userId }).sort({ createdAt: -1 }).limit(30).lean();
  res.json({ items });
}));

router.post("/deposits", requireAuth, orderLimiter, wrap(async (req, res) => {
  const site = await getSite();
  const b = req.body || {};
  const method = str(b.method, 30);
  const sender = normPhone(b.sender);
  const trxId = str(b.trxId, 30).toUpperCase();
  const amount = int(b.amount, 0);

  if (!site.payment.methods.some((m) => m.active && m.name === method)) throw httpError(400, "পেমেন্ট মাধ্যম নির্বাচন করুন");
  if (!isPhone(sender)) throw httpError(400, "যে নম্বর থেকে টাকা পাঠিয়েছেন সেটি দিন");
  if (!/^[A-Z0-9]{6,30}$/.test(trxId)) throw httpError(400, "সঠিক Transaction ID দিন");
  if (amount < site.payment.minDeposit || amount > site.payment.maxDeposit) {
    throw httpError(400, `পরিমাণ ৳${site.payment.minDeposit} - ৳${site.payment.maxDeposit} এর মধ্যে হতে হবে`);
  }
  const pending = await Deposit.countDocuments({ user: req.session.userId, status: "pending" });
  if (pending >= 5) throw httpError(429, "আগের রিকোয়েস্টগুলো যাচাই হওয়া পর্যন্ত অপেক্ষা করুন");

  try {
    const d = await Deposit.create({ user: req.session.userId, method, sender, trxId, amount });
    res.status(201).json({ deposit: d });
  } catch (e) {
    if (e.code === 11000) throw httpError(409, "এই Transaction ID আগেই জমা দেওয়া হয়েছে");
    throw e;
  }
}));

module.exports = router;
