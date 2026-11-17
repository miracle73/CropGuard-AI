import crypto from 'node:crypto';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { secrets } from './lib.mjs';

const sqs = new SQSClient({});

export const handler = async (event) => {
  const s = await secrets();

  // Meta webhook verification
  if (event.requestContext.http.method === 'GET') {
    const q = event.queryStringParameters || {};
    return q['hub.verify_token'] === s.WA_VERIFY_TOKEN
      ? { statusCode: 200, body: q['hub.challenge'] }
      : { statusCode: 403 };
  }

  // Verify signature
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
  const sig = event.headers['x-hub-signature-256'] || '';
  const exp = 'sha256=' + crypto.createHmac('sha256', s.WA_APP_SECRET).update(raw).digest('hex');
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) {
    return { statusCode: 401 };
  }

  const msgs = JSON.parse(raw).entry?.flatMap(e => e.changes.flatMap(c => c.value.messages || [])) || [];
  for (const m of msgs) {
    await sqs.send(new SendMessageCommand({ QueueUrl: process.env.QUEUE_URL, MessageBody: JSON.stringify(m) }));
  }
  return { statusCode: 200, body: 'ok' };
};
