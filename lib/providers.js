"use strict";

/**
 * Provider adapter.
 *
 * execute(order) always resolves to { status, ref, message } where status is:
 *   "success"    - provider confirmed delivery
 *   "failed"     - provider definitely rejected it (wallet is refunded automatically)
 *   "processing" - unknown / pending (admin confirms or refunds from the Orders page)
 *
 * PROVIDER_MODE=demo (default) never calls any external service.
 * Demo test numbers:  ...0000 -> failed,  ...9999 -> stays processing.
 *
 * LIVE MODE: every provider has its own request format. Edit buildRequest() and
 * parseResponse() below to match the documentation your provider gives you.
 */

const ENV = {
  recharge: ["RECHARGE_API_URL", "RECHARGE_API_KEY"],
  package: ["RECHARGE_API_URL", "RECHARGE_API_KEY"],
  freefire: ["FF_API_URL", "FF_API_KEY"],
  bill: ["BILL_API_URL", "BILL_API_KEY"]
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function demo(order) {
  await sleep(500);
  const t = String(order.target);
  if (t.endsWith("0000")) return { status: "failed", ref: "", message: "Demo: simulated failure" };
  if (t.endsWith("9999")) return { status: "processing", ref: "DEMO-" + order.orderNo, message: "Demo: pending" };
  return { status: "success", ref: "DEMO-" + order.orderNo, message: "Demo: delivered" };
}

function buildRequest(order) {
  // >>> Adjust to your provider's API documentation <<<
  return {
    type: order.type,            // recharge | package | freefire | bill
    order_no: order.orderNo,
    target: order.target,        // mobile number / Free Fire UID / bill account
    amount: order.amount,
    operator: order.operator,
    code: order.code             // provider package / service code set in admin panel
  };
}

function parseResponse(httpStatus, json) {
  // >>> Adjust to your provider's response format <<<
  const s = String(json.status || "").toLowerCase();
  if (json.success === true || s === "success" || s === "completed") {
    return { status: "success", ref: String(json.ref || json.trx_id || json.id || ""), message: json.message || "" };
  }
  if (json.success === false || s === "failed" || s === "rejected" || (httpStatus >= 400 && httpStatus < 500)) {
    return { status: "failed", ref: "", message: json.message || "Rejected by provider" };
  }
  return { status: "processing", ref: String(json.ref || json.id || ""), message: json.message || "" };
}

async function live(order) {
  const [urlKey, tokenKey] = ENV[order.type] || [];
  const url = process.env[urlKey];
  const token = process.env[tokenKey];
  if (!url || !token) {
    return { status: "failed", ref: "", message: "Provider is not configured" };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(buildRequest(order)),
      signal: ctrl.signal
    });
    let json = {};
    try { json = await r.json(); } catch (_) { /* non-JSON body */ }
    return parseResponse(r.status, json);
  } catch (err) {
    // Timeout / network error: we cannot know if it was delivered, so never auto-refund.
    return { status: "processing", ref: "", message: "Provider did not respond" };
  } finally {
    clearTimeout(timer);
  }
}

async function execute(order) {
  const mode = (process.env.PROVIDER_MODE || "demo").toLowerCase();
  return mode === "live" ? live(order) : demo(order);
}

module.exports = { execute, mode: () => (process.env.PROVIDER_MODE || "demo").toLowerCase() };
