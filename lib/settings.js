"use strict";

const { Site, Package, Service, Banner, Game, Category } = require("./models");
const { str, hex, bool, int, isId } = require("./util");

const DEFAULTS = {
  key: "site",
  seeded: false,
  brand: { name: "RS PAY", tagline: "রিচার্জ, ডায়মন্ড ও বিল পে — এক অ্যাপে", logoId: "" },
  theme: { preset: "royal", brand: "#7c3aed", accent: "#f5b942" },
  hero: {
    badge: "⚡ ইনস্ট্যান্ট ডেলিভারি",
    title: "মোবাইল রিচার্জ, ফ্রি ফায়ার ডায়মন্ড ও বিল পে",
    subtitle: "সব অপারেটরের রিচার্জ, ডাটা ও মিনিট অফার, ফ্রি ফায়ার টপআপ এবং গ্যাস-বিদ্যুৎ-পানির বিল — কয়েক সেকেন্ডে, ২৪/৭।",
    cta1: "এখনই শুরু করুন",
    cta2: "সার্ভিস দেখুন"
  },
  heroMedia: { type: "none", image: "", videoUrl: "" },
  sections: { stats: true, services: true, features: true, steps: true, faq: true },
  steps: [
    { title: "অ্যাকাউন্ট খুলুন", text: "মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে ১ মিনিটে রেজিস্ট্রেশন।" },
    { title: "ওয়ালেটে টাকা যোগ করুন", text: "bKash/Nagad-এ পাঠিয়ে Transaction ID জমা দিন।" },
    { title: "অর্ডার করুন", text: "রিচার্জ, গেম টপআপ বা বিল — ট্যাপ করুন, বাকিটা আমরা দেখছি।" }
  ],
  announcement: { active: true, text: "🎉 নতুন ইউজারদের জন্য সহজ রেজিস্ট্রেশন — আজই অ্যাকাউন্ট খুলুন!" },
  stats: [
    { value: "24/7", label: "সার্ভিস চালু" },
    { value: "৫+", label: "অপারেটর" },
    { value: "<১০s", label: "গড় ডেলিভারি" },
    { value: "১০০%", label: "নিরাপদ" }
  ],
  features: [
    { icon: "⚡", title: "ইনস্ট্যান্ট রিচার্জ", text: "অর্ডার করার সাথে সাথেই প্রসেস শুরু, কয়েক সেকেন্ডে ডেলিভারি।" },
    { icon: "💎", title: "ফ্রি ফায়ার টপআপ", text: "শুধু UID দিন, ডায়মন্ড সরাসরি আপনার অ্যাকাউন্টে।" },
    { icon: "🧾", title: "সব বিল এক জায়গায়", text: "গ্যাস, বিদ্যুৎ, পানি ও ইন্টারনেট বিল পরিশোধ করুন সহজে।" },
    { icon: "📦", title: "ডাটা ও মিনিট অফার", text: "জিপি, রবি, বাংলালিংক, এয়ারটেল, টেলিটক — সব অফার একসাথে।" },
    { icon: "🔒", title: "নিরাপদ ওয়ালেট", text: "প্রতিটি লেনদেনের হিসাব ওয়ালেট হিস্ট্রিতে পরিষ্কারভাবে দেখুন।" },
    { icon: "🎧", title: "দ্রুত সাপোর্ট", text: "সমস্যা হলে হোয়াটসঅ্যাপ বা ফোনে সরাসরি যোগাযোগ করুন।" }
  ],
  faq: [
    { q: "ওয়ালেটে টাকা কীভাবে যোগ করব?", a: "অ্যাপে ‘ওয়ালেট’ থেকে পেমেন্ট নম্বর দেখে টাকা পাঠান, তারপর Transaction ID জমা দিন। অ্যাডমিন যাচাই করে ব্যালেন্স যোগ করবেন।" },
    { q: "অর্ডার ব্যর্থ হলে টাকা কি ফেরত পাব?", a: "হ্যাঁ, ব্যর্থ অর্ডারের টাকা স্বয়ংক্রিয়ভাবে আপনার ওয়ালেটে ফেরত আসে।" },
    { q: "রিচার্জ পেতে কত সময় লাগে?", a: "সাধারণত কয়েক সেকেন্ড। নেটওয়ার্ক জটিলতায় কিছুটা বেশি সময় লাগতে পারে।" }
  ],
  contact: { phone: "", whatsapp: "", email: "", address: "", facebook: "", telegram: "" },
  footer: "© RS PAY. সর্বস্বত্ব সংরক্ষিত।",
  payment: {
    minDeposit: 50,
    maxDeposit: 50000,
    methods: [
      { name: "bKash", number: "01XXXXXXXXX", kind: "Personal", note: "Send Money করুন", active: true },
      { name: "Nagad", number: "01XXXXXXXXX", kind: "Personal", note: "Send Money করুন", active: true }
    ]
  },
  orders: { minRecharge: 10, maxRecharge: 5000 },
  referral: { bonus: 0 },
  maintenance: { active: false, message: "সাইট রক্ষণাবেক্ষণের কাজ চলছে। কিছুক্ষণ পর আবার চেষ্টা করুন।" },
  operators: [
    { id: "gp", name: "Grameenphone", short: "GP", color: "#00a0e3", active: true },
    { id: "robi", name: "Robi", short: "Robi", color: "#e3262e", active: true },
    { id: "bl", name: "Banglalink", short: "BL", color: "#f58220", active: true },
    { id: "airtel", name: "Airtel", short: "Airtel", color: "#ed1c24", active: true },
    { id: "teletalk", name: "Teletalk", short: "Teletalk", color: "#3aa935", active: true }
  ]
};

const SEED_PACKAGES = [
  // Internet
  ["internet", "gp", "১ GB", "৭ দিন", 49, "", "Hot"],
  ["internet", "gp", "৫ GB", "৩০ দিন", 199, "", ""],
  ["internet", "gp", "১২ GB", "৩০ দিন", 349, "", "Popular"],
  ["internet", "robi", "২ GB", "৭ দিন", 69, "", ""],
  ["internet", "robi", "১০ GB", "৩০ দিন", 299, "", "Popular"],
  ["internet", "bl", "৩ GB", "৭ দিন", 79, "", ""],
  ["internet", "bl", "২০ GB", "৩০ দিন", 399, "", "Best"],
  ["internet", "airtel", "৫ GB", "৩০ দিন", 189, "", ""],
  ["internet", "teletalk", "৩ GB", "৩০ দিন", 99, "", ""],
  // Minutes
  ["minute", "gp", "১০০ মিনিট", "৭ দিন", 59, "", ""],
  ["minute", "gp", "৩০০ মিনিট", "৩০ দিন", 169, "", "Popular"],
  ["minute", "robi", "২০০ মিনিট", "৩০ দিন", 119, "", ""],
  ["minute", "bl", "৫০০ মিনিট", "৩০ দিন", 249, "", "Best"],
  // Combo
  ["combo", "gp", "৫ GB + ১০০ মিনিট", "৩০ দিন", 299, "", "Combo"],
  ["combo", "robi", "১০ GB + ২০০ মিনিট", "৩০ দিন", 399, "", "Combo"],
  ["combo", "bl", "১৫ GB + ৩০০ মিনিট", "৩০ দিন", 499, "", "Best"],
  // Free Fire
  ["freefire", "", "২৫ 💎 ডায়মন্ড", "", 22, "", ""],
  ["freefire", "", "১১০ 💎 ডায়মন্ড", "", 88, "", "Hot"],
  ["freefire", "", "২৩০ 💎 ডায়মন্ড", "", 175, "", ""],
  ["freefire", "", "৫৮৫ 💎 ডায়মন্ড", "", 440, "", "Popular"],
  ["freefire", "", "১২৪০ 💎 ডায়মন্ড", "", 880, "", ""],
  ["freefire", "", "সাপ্তাহিক মেম্বারশিপ", "৭ দিন", 160, "", "Pass"],
  ["freefire", "", "মাসিক মেম্বারশিপ", "৩০ দিন", 780, "", "Pass"]
];

const SEED_SERVICES = [
  ["electricity", "বিদ্যুৎ বিল", "Electricity", "💡", "মিটার / অ্যাকাউন্ট নম্বর"],
  ["gas", "গ্যাস বিল", "Gas", "🔥", "কাস্টমার আইডি"],
  ["water", "পানি বিল", "Water", "💧", "কাস্টমার নম্বর"],
  ["internet", "ব্রডব্যান্ড", "Broadband", "📡", "ইউজার আইডি"],
  ["tv", "ক্যাবল টিভি / DTH", "TV / DTH", "📺", "সাবস্ক্রাইবার আইডি"]
];

const SEED_GAMES = [
  ["freefire", "Free Fire", "💎", "ডায়মন্ড", "Free Fire UID"],
  ["pubg", "PUBG Mobile", "🪖", "UC", "PUBG Player ID"]
];
const SEED_PUBG = [["৬০ UC", 85], ["৩২৫ UC", 430], ["৬৬০ UC", 860], ["১৮০০ UC", 2150]];
const SEED_CATEGORIES = [
  ["রিচার্জ", "📱", "#/recharge", true], ["ডাটা/মিনিট", "📦", "#/packs", true],
  ["গেম টপআপ", "🎮", "#/freefire", true], ["বিল পে", "🧾", "#/bills", true],
  ["টাকা যোগ", "➕", "#/wallet?add", false], ["অর্ডার", "📋", "#/orders", false],
  ["হিস্ট্রি", "🧮", "#/wallet", false], ["রেফার", "🎁", "#/profile", false]
];

let cache = null;
let cacheAt = 0;

async function ensureSite() {
  let doc = await Site.findOne({ key: "site" }).lean();
  if (!doc) {
    doc = (await Site.create({ ...DEFAULTS })).toObject();
  }
  return doc;
}

// Merge stored settings over defaults so newly added fields always exist.
function merge(doc) {
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  for (const k of Object.keys(DEFAULTS)) {
    if (doc[k] === undefined) continue;
    if (Array.isArray(DEFAULTS[k])) out[k] = doc[k];
    else if (typeof DEFAULTS[k] === "object") out[k] = { ...DEFAULTS[k], ...doc[k] };
    else out[k] = doc[k];
  }
  return out;
}

async function getSite() {
  if (cache && Date.now() - cacheAt < 10000) return cache;
  cache = merge(await ensureSite());
  cacheAt = Date.now();
  return cache;
}

async function seedIfNeeded() {
  const doc = await ensureSite();
  if (doc.seeded) return;
  if ((await Package.estimatedDocumentCount()) === 0) {
    await Package.insertMany(SEED_PACKAGES.map((p, i) => ({
      type: p[0], operator: p[1], title: p[2], validity: p[3], price: p[4], code: p[5], tag: p[6], sort: i
    })));
  }
  if ((await Service.estimatedDocumentCount()) === 0) {
    await Service.insertMany(SEED_SERVICES.map((s, i) => ({
      key: s[0], name: s[1], nameEn: s[2], icon: s[3], accountLabel: s[4], sort: i
    })));
  }
  if ((await Banner.estimatedDocumentCount()) === 0) {
    await Banner.insertMany([
      { title: "ফ্রি ফায়ার ডায়মন্ড", text: "সেরা দামে, ইনস্ট্যান্ট টপআপ", link: "/app#/freefire", style: 1, placement: "app", sort: 0 },
      { title: "ডাটা ও মিনিট অফার", text: "সব অপারেটরের সেরা প্যাকেজ", link: "/app#/packs", style: 2, placement: "app", sort: 1 },
      { title: "বিল পে করুন সহজে", text: "গ্যাস, বিদ্যুৎ, পানি — এক জায়গায়", link: "/app#/bills", style: 3, placement: "app", sort: 2 }
    ]);
  }
  await Site.updateOne({ key: "site" }, { $set: { seeded: true } });
}

// Runs once for existing databases too: adds games + home icons and links old Free Fire packs to Free Fire.
async function seedExtras() {
  const doc = await ensureSite();
  if (doc.seeded2) return;
  let games = await Game.find().sort({ sort: 1 }).lean();
  if (!games.length) {
    games = (await Game.insertMany(SEED_GAMES.map((g, i) => ({ key: g[0], name: g[1], icon: g[2], currency: g[3], idLabel: g[4], sort: i })))).map((g) => g.toObject());
    const ff = games.find((g) => g.key === "freefire");
    const pubg = games.find((g) => g.key === "pubg");
    const existing = await Package.countDocuments({ type: "freefire" });
    if (existing) {
      await Package.updateMany({ type: "freefire", gameId: { $in: ["", null] } }, { gameId: String(ff._id) });
    }
    if (pubg) {
      await Package.insertMany(SEED_PUBG.map((p, i) => ({ type: "freefire", gameId: String(pubg._id), title: p[0], price: p[1], sort: 100 + i })));
    }
  }
  if ((await Category.estimatedDocumentCount()) === 0) {
    await Category.insertMany(SEED_CATEGORIES.map((c, i) => ({ title: c[0], icon: c[1], link: c[2], landing: c[3], sort: i })));
  }
  await Site.updateOne({ key: "site" }, { $set: { seeded2: true } });
}

const list = (v, max, fn) => (Array.isArray(v) ? v.slice(0, max).map(fn) : []);

function sanitize(input, cur) {
  const b = input || {};
  const out = {};
  if (b.brand) out.brand = {
    name: str(b.brand.name, 40) || cur.brand.name,
    tagline: str(b.brand.tagline, 120),
    logoId: str(b.brand.logoId, 40)
  };
  if (b.theme) out.theme = {
    preset: ["royal", "aurora", "light"].includes(b.theme.preset) ? b.theme.preset : "royal",
    brand: hex(b.theme.brand, cur.theme.brand),
    accent: hex(b.theme.accent, cur.theme.accent)
  };
  if (b.hero) out.hero = {
    badge: str(b.hero.badge, 60), title: str(b.hero.title, 120),
    subtitle: str(b.hero.subtitle, 300), cta1: str(b.hero.cta1, 30), cta2: str(b.hero.cta2, 30)
  };
  if (b.heroMedia) {
    const hm = b.heroMedia;
    const v = str(hm.videoUrl, 300);
    out.heroMedia = {
      type: ["none", "image", "video"].includes(hm.type) ? hm.type : "none",
      image: isId(hm.image) ? String(hm.image) : "",
      videoUrl: /^https:\/\//.test(v) ? v : ""
    };
  }
  if (b.sections) out.sections = {
    stats: bool(b.sections.stats, true), services: bool(b.sections.services, true),
    features: bool(b.sections.features, true), steps: bool(b.sections.steps, true), faq: bool(b.sections.faq, true)
  };
  if (b.steps) out.steps = list(b.steps, 6, (s) => ({ title: str(s.title, 50), text: str(s.text, 160) }));
  if (b.announcement) out.announcement = {
    active: bool(b.announcement.active), text: str(b.announcement.text, 200)
  };
  if (b.stats) out.stats = list(b.stats, 4, (s) => ({ value: str(s.value, 12), label: str(s.label, 30) }));
  if (b.features) out.features = list(b.features, 8, (f) => ({
    icon: str(f.icon, 8), title: str(f.title, 40), text: str(f.text, 160)
  }));
  if (b.faq) out.faq = list(b.faq, 10, (f) => ({ q: str(f.q, 120), a: str(f.a, 400) }));
  if (b.contact) out.contact = {
    phone: str(b.contact.phone, 20), whatsapp: str(b.contact.whatsapp, 20),
    email: str(b.contact.email, 80), address: str(b.contact.address, 120),
    facebook: str(b.contact.facebook, 200), telegram: str(b.contact.telegram, 200)
  };
  if (typeof b.footer === "string") out.footer = str(b.footer, 160);
  if (b.payment) out.payment = {
    minDeposit: int(b.payment.minDeposit, 50, 1, 1000000),
    maxDeposit: int(b.payment.maxDeposit, 50000, 1, 10000000),
    methods: list(b.payment.methods, 8, (m) => ({
      name: str(m.name, 30), number: str(m.number, 30), kind: str(m.kind, 20),
      note: str(m.note, 80), active: bool(m.active, true)
    }))
  };
  if (b.orders) out.orders = {
    minRecharge: int(b.orders.minRecharge, 10, 1, 100000),
    maxRecharge: int(b.orders.maxRecharge, 5000, 1, 1000000)
  };
  if (b.referral) out.referral = { bonus: int(b.referral.bonus, 0, 0, 10000) };
  if (b.maintenance) out.maintenance = {
    active: bool(b.maintenance.active), message: str(b.maintenance.message, 200)
  };
  if (b.operators) out.operators = list(b.operators, 10, (o) => ({
    id: str(o.id, 16).toLowerCase().replace(/[^a-z0-9]/g, ""),
    name: str(o.name, 30), short: str(o.short, 12), image: isId(o.image) ? String(o.image) : "",
    color: hex(o.color, "#888888"), active: bool(o.active, true)
  })).filter((o) => o.id && o.name);
  return out;
}

async function saveSite(input) {
  const cur = await getSite();
  const patch = sanitize(input, cur);
  await Site.updateOne({ key: "site" }, { $set: patch }, { upsert: true });
  cache = null;
  return getSite();
}

// Version for public consumption: no payment numbers.
function publicView(site) {
  const { payment, ...rest } = site;
  return { ...rest, payment: { minDeposit: payment.minDeposit, maxDeposit: payment.maxDeposit } };
}

module.exports = { getSite, saveSite, seedIfNeeded, seedExtras, publicView, DEFAULTS, SEED_PACKAGES, SEED_SERVICES };
