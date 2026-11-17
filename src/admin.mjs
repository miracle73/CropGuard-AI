import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { secrets } from './lib.mjs';

const db = new DynamoDBClient({});
const s3 = new S3Client({});

// JSON API for the Vercel admin dashboard. CORS is handled by the Function URL config.
export const handler = async (event) => {
  const s = await secrets();
  if (!s.ADMIN_PASS || event.headers['x-admin-pass'] !== s.ADMIN_PASS) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  const [diag, farmers] = await Promise.all([
    db.send(new ScanCommand({ TableName: process.env.TABLE, Limit: 200 })),
    db.send(new ScanCommand({ TableName: process.env.FARMERS, Select: 'COUNT' }))
  ]);
  const items = diag.Items.sort((a, b) => b.ts.S.localeCompare(a.ts.S)).slice(0, 100);
  const scans = await Promise.all(items.map(async i => ({
    ts: i.ts.S,
    phone: i.phone.S,
    ...JSON.parse(i.data.S),
    image: i.imageKey ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.BUCKET, Key: i.imageKey.S }), { expiresIn: 3600 }) : null
  })));
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ farmers: farmers.Count, diagnoses: diag.Count, scans })
  };
};
