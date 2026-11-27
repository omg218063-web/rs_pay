"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const model = (name, schema, collection) =>
  mongoose.models[name] || mongoose.model(name, schema, collection);

// Existing "users" collection is kept, so current accounts and password hashes keep working.
const User = model("User", new Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  balance: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ["active", "blocked"], default: "active" },
  referralCode: { type: String, index: { unique: true, sparse: true } },
  referredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  refBonusPaid: { type: Boolean, default: false },
  lastSeen: { type: Date, default: null }
}, { timestamps: true, strict: false }));

const Package = model("RSPackage", new Schema({
  type: { type: String, enum: ["internet", "minute", "combo", "freefire"], required: true },
  operator: { type: String, default: "" },
  title: { type: String, required: true, maxlength: 80 },
  detail: { type: String, default: "", maxlength: 160 },
  validity: { type: String, default: "", maxlength: 40 },
  price: { type: Number, required: true, min: 1 },
  oldPrice: { type: Number, default: 0 },
  tag: { type: String, default: "", maxlength: 24 },
  code: { type: String, default: "", maxlength: 80 },
  active: { type: Boolean, default: true },
  sort: { type: Number, default: 0 }
}, { timestamps: true }), "rs_packages");

const Service = model("RSService", new Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true, maxlength: 60 },
  nameEn: { type: String, default: "", maxlength: 60 },
  icon: { type: String, default: "💡", maxlength: 8 },
  accountLabel: { type: String, default: "Account / Meter No.", maxlength: 60 },
  min: { type: Number, default: 10 },
  max: { type: Number, default: 50000 },
  feePercent: { type: Number, default: 0, min: 0, max: 20 },
  code: { type: String, default: "", maxlength: 80 },
  active: { type: Boolean, default: true },
  sort: { type: Number, default: 0 }
}, { timestamps: true }), "rs_services");

const Banner = model("RSBanner", new Schema({
  title: { type: String, default: "", maxlength: 80 },
  text: { type: String, default: "", maxlength: 160 },
  imageId: { type: String, default: "" },
  link: { type: String, default: "" },
  style: { type: Number, default: 1, min: 1, max: 5 },
  placement: { type: String, enum: ["app", "landing"], default: "app" },
  active: { type: Boolean, default: true },
  sort: { type: Number, default: 0 }
}, { timestamps: true }), "rs_banners");

const Order = model("RSOrder", new Schema({
  orderNo: { type: String, unique: true, required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  type: { type: String, enum: ["recharge", "package", "freefire", "bill"], required: true },
  title: { type: String, required: true },
  operator: { type: String, default: "" },
  target: { type: String, required: true },
  amount: { type: Number, required: true },
  fee: { type: Number, default: 0 },
  total: { type: Number, required: true },
  code: { type: String, default: "" },
  status: {
    type: String,
    enum: ["processing", "success", "failed", "refunded"],
    default: "processing",
    index: true
  },
  providerRef: { type: String, default: "" },
  note: { type: String, default: "" },
  meta: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true }), "rs_orders");

const Deposit = model("RSDeposit", new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  method: { type: String, required: true },
  sender: { type: String, required: true },
  trxId: { type: String, required: true, unique: true },
  amount: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  note: { type: String, default: "" }
}, { timestamps: true }), "rs_deposits");

const WalletTx = model("RSWalletTx", new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  kind: { type: String, enum: ["deposit", "purchase", "refund", "adjust", "bonus"], required: true },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  ref: { type: String, default: "" },
  note: { type: String, default: "" }
}, { timestamps: true }), "rs_wallet_tx");

const Site = model("RSSite", new Schema({}, { strict: false, timestamps: true }), "rs_site");

const Media = model("RSPayMedia", new Schema({
  contentType: { type: String, required: true },
  data: { type: Buffer, required: true },
  size: { type: Number, required: true }
}, { timestamps: true }), "media");

// ---- wallet helpers (atomic) ----

async function credit(userId, amount, kind, ref = "", note = "") {
  const u = await User.findByIdAndUpdate(userId, { $inc: { balance: amount } }, { new: true });
  if (!u) return null;
  await WalletTx.create({ user: userId, kind, amount, balanceAfter: u.balance, ref, note });
  return u;
}

// returns updated user, or null when balance is insufficient / account blocked
async function debit(userId, amount, kind, ref = "", note = "") {
  const u = await User.findOneAndUpdate(
    { _id: userId, status: { $ne: "blocked" }, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true }
  );
  if (!u) return null;
  await WalletTx.create({ user: userId, kind, amount: -amount, balanceAfter: u.balance, ref, note });
  return u;
}

module.exports = {
  User, Package, Service, Banner, Order, Deposit, WalletTx, Site, Media, credit, debit
};
