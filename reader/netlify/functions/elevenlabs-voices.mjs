const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return json({ error: "ELEVENLABS_API_KEY not configured on Netlify" }, 503);
  }

  const res = await fetch(`${ELEVENLABS_API}/voices`, {
    headers: { "xi-api-key": apiKey },
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(err, {
      status: res.status,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const data = await res.json();
  const voices = (data.voices || [])
    .filter((v) => !v.category || v.category === "premade" || v.category === "cloned")
    .map((v) => ({
      voice_id: v.voice_id,
      name: v.name,
      labels: v.labels || {},
      preview_url: v.preview_url,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return json({ voices }, 200, { "Cache-Control": "public, max-age=3600" });
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json", ...extra },
  });
}
