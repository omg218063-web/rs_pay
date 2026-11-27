"use strict";

const router = require("express").Router();
const { Package, Service, Banner, Media } = require("../lib/models");
const { getSite, publicView } = require("../lib/settings");
const { wrap, isId } = require("../lib/util");

// Everything the landing page / app needs in one request.
router.get("/bootstrap", wrap(async (req, res) => {
  const site = await getSite();
  const [banners, services] = await Promise.all([
    Banner.find({ active: true }).sort({ sort: 1, createdAt: -1 }).lean(),
    Service.find({ active: true }).sort({ sort: 1 }).lean()
  ]);
  res.json({ site: publicView(site), banners, services });
}));

router.get("/packages", wrap(async (req, res) => {
  const q = { active: true };
  if (["internet", "minute", "combo", "freefire"].includes(req.query.type)) q.type = req.query.type;
  const items = await Package.find(q).sort({ sort: 1, price: 1 }).lean();
  res.json({ items });
}));

router.get("/media/:id", wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).end();
  const m = await Media.findById(req.params.id).lean();
  if (!m) return res.status(404).end();
  res.set({
    "Content-Type": m.contentType,
    "Cache-Control": "public, max-age=604800, immutable",
    "X-Content-Type-Options": "nosniff"
  });
  res.send(m.data.buffer ? Buffer.from(m.data.buffer) : m.data);
}));

module.exports = router;
