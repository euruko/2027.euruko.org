import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import worker from "./index.js";

const env = {
  ALLOWED_ORIGINS: "https://2027.euruko.org",
  TITO_ACCOUNT: "venividicodi",
  TITO_EVENT: "euruko-2027",
  TITO_API_TOKEN: "tito-secret",
  TURNSTILE_SECRET: "turnstile-secret",
};

const realFetch = globalThis.fetch;
let calls;

function stubFetch({ turnstile = true, tito = 201 } = {}) {
  calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("turnstile")) return Response.json({ success: turnstile });
    return new Response("{}", { status: tito });
  };
}

function submit(fields, { origin = "https://2027.euruko.org", method = "POST" } = {}) {
  const body = new URLSearchParams(fields);
  const headers = origin ? { Origin: origin } : {};
  return worker.fetch(new Request("https://interest.example/", { method, headers, body: method === "POST" ? body : undefined }), env);
}

const valid = { name: "Ada", email: "ada@example.com", "cf-turnstile-response": "token" };

describe("interest worker", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("adds the address to Tito and redirects to the thank-you page", async () => {
    stubFetch();
    const response = await submit(valid);

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("Location"), "https://2027.euruko.org/interested/thanks/");
    const tito = calls.find((call) => call.url.includes("api.tito.io"));
    assert.equal(tito.url, "https://api.tito.io/v3/venividicodi/euruko-2027/interested_users");
    assert.equal(tito.options.headers.Authorization, "Token token=tito-secret");
    assert.deepEqual(JSON.parse(tito.options.body), { interested_user: { email: "ada@example.com", name: "Ada" } });
  });

  it("rejects other origins and missing origins", async () => {
    stubFetch();
    assert.equal((await submit(valid, { origin: "https://evil.example" })).status, 403);
    assert.equal((await submit(valid, { origin: null })).status, 403);
    assert.equal(calls.length, 0);
  });

  it("rejects other methods", async () => {
    stubFetch();
    assert.equal((await submit(valid, { method: "GET" })).status, 405);
  });

  it("pretends to succeed on the honeypot without calling anything", async () => {
    stubFetch();
    const response = await submit({ ...valid, website: "http://spam.example" });

    assert.equal(response.headers.get("Location"), "https://2027.euruko.org/interested/thanks/");
    assert.equal(calls.length, 0);
  });

  it("fails without a Turnstile token or when verification fails", async () => {
    stubFetch();
    const missing = await submit({ name: "Ada", email: "ada@example.com" });
    assert.equal(missing.headers.get("Location"), "https://2027.euruko.org/interested/error/");
    assert.equal(calls.length, 0);

    stubFetch({ turnstile: false });
    const failed = await submit(valid);
    assert.equal(failed.headers.get("Location"), "https://2027.euruko.org/interested/error/");
    assert.equal(calls.some((call) => call.url.includes("api.tito.io")), false);
  });

  it("fails on an invalid email", async () => {
    stubFetch();
    const response = await submit({ ...valid, email: "not-an-email" });

    assert.equal(response.headers.get("Location"), "https://2027.euruko.org/interested/error/");
    assert.equal(calls.length, 0);
  });

  it("treats a duplicate address as success and a Tito failure as an error", async () => {
    stubFetch({ tito: 422 });
    assert.match((await submit(valid)).headers.get("Location"), /thanks/);

    stubFetch({ tito: 500 });
    assert.match((await submit(valid)).headers.get("Location"), /error/);
  });
});
