"use strict";

const mongoose = require("mongoose");

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const money = (n) => Math.round(Number(n) * 100) / 100;

const str = (v, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const normPhone = (p) => {
  let s = String(p || "").replace(/[\s-]/g, "");
  if (s.startsWith("+880")) s = "0" + s.slice(4);
  else if (s.startsWith("880")) s = "0" + s.slice(3);
  return s;
};

const isPhone = (p) => /^01[3-9]\d{8}$/.test(p);
const hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v || "") ? v : d);
const isId = (id) => mongoose.isValidObjectId(id);
const bool = (v, d = false) => (typeof v === "boolean" ? v : d);
const int = (v, d = 0, min = -Infinity, max = Infinity) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, n));
};
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const orderNo = () =>
  "RS" +
  Date.now().toString(36).toUpperCase() +
  Math.random().toString(36).slice(2, 5).toUpperCase();

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = {
  wrap, money, str, normPhone, isPhone, hex, isId, bool, int, escRe, orderNo, httpError
};
