import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';

let cache;
// SSM keys under /cropguard: OPENAI_KEY, WA_TOKEN, WA_PHONE_ID, WA_APP_SECRET, WA_VERIFY_TOKEN
export async function secrets() {
  if (cache) return cache;
  const r = await new SSMClient({}).send(new GetParametersByPathCommand({ Path: process.env.SSM_PREFIX, WithDecryption: true }));
  cache = Object.fromEntries(r.Parameters.map(p => [p.Name.split('/').pop(), p.Value]));
  return cache;
}

const GRAPH = 'https://graph.facebook.com/v20.0';

export async function sendText(s, to, body) {
  const r = await fetch(`${GRAPH}/${s.WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } })
  });
  if (!r.ok) throw new Error(`WA send ${r.status}: ${await r.text()}`);
}

export async function downloadMedia(s, id) {
  const auth = { Authorization: `Bearer ${s.WA_TOKEN}` };
  const meta = await (await fetch(`${GRAPH}/${id}`, { headers: auth })).json();
  const bin = await fetch(meta.url, { headers: auth });
  return { b64: Buffer.from(await bin.arrayBuffer()).toString('base64'), mime: meta.mime_type };
}

const PROMPT = `You are CropGuard AI, an expert agronomist for African smallholder farms (maize, cassava, tomato, cocoa, coffee, rice, beans, banana, sorghum, yam, etc).
Analyse the plant photo. Return ONLY JSON:
{"is_plant":bool,"crop":"","disease":"","healthy":bool,"confidence":0-1,"severity":"low|medium|high","symptoms":[],"treatment":{"organic":[],"chemical":[]},"prevention":[]}
Recommend affordable treatments sold in African agro-dealer shops. Keep each item short.`;

export async function diagnose(s, img) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      max_tokens: 700,
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.b64}` } }] }
      ]
    })
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  return JSON.parse((await r.json()).choices[0].message.content);
}

export function formatReply(d) {
  if (!d.is_plant) return '🤔 I could not see a plant. Please send a clear photo of the affected leaf, stem or fruit.';
  if (d.confidence < 0.6) return '📷 I am not sure. Please send a closer, well-lit photo of the affected part.';
  if (d.healthy) return `✅ Your ${d.crop} looks healthy! 🌱`;
  const l = a => (a || []).map(x => `• ${x}`).join('\n');
  return `🌿 *Crop:* ${d.crop}\n🦠 *Problem:* ${d.disease}\n⚠️ *Severity:* ${d.severity} (${Math.round(d.confidence * 100)}% sure)\n\n` +
    `*Organic treatment:*\n${l(d.treatment?.organic)}\n\n*Chemical treatment:*\n${l(d.treatment?.chemical)}\n\n` +
    `*Prevention:*\n${l(d.prevention)}\n\n_If it gets worse, contact your local extension officer._`;
}
