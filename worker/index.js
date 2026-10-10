const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    }

    const origin = request.headers.get("Origin");
    const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
    if (!allowedOrigins.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    const outcome = await subscribe(request, env);
    return Response.redirect(`${origin}/interested/${outcome}/`, 303);
  },
};

async function subscribe(request, env) {
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim();

  if (form.get("website")) return "thanks";
  if (email.length > 254 || name.length > 200 || !EMAIL_PATTERN.test(email)) return "error";
  if (!(await humanVerified(form.get("cf-turnstile-response"), request, env))) return "error";

  const response = await fetch(
    `https://api.tito.io/v3/${env.TITO_ACCOUNT}/${env.TITO_EVENT}/interested_users`,
    {
      method: "POST",
      headers: {
        Authorization: `Token token=${env.TITO_API_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ interested_user: { email, name: name || undefined } }),
    },
  );

  // Tito answers 422 when the address is already on the list, which is a success for the visitor.
  return response.ok || response.status === 422 ? "thanks" : "error";
}

async function humanVerified(token, request, env) {
  if (!token) return false;

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: String(token),
    remoteip: request.headers.get("CF-Connecting-IP") || "",
  });
  const response = await fetch(TURNSTILE_URL, { method: "POST", body });
  const result = await response.json();
  return result.success === true;
}
