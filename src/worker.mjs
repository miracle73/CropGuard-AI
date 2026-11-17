import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
const s3 = new S3Client({});
import { secrets, sendText, downloadMedia, diagnose, formatReply } from './lib.mjs';

const db = new DynamoDBClient({});

export const handler = async (event) => {
  const s = await secrets();
  for (const rec of event.Records) {
    const m = JSON.parse(rec.body);
    if (m.type !== 'image') {
      await sendText(s, m.from, '👋 Welcome to *CropGuard AI*! Send a photo of a sick leaf, stem or fruit and I will tell you the disease and how to treat it.');
      continue;
    }
    await sendText(s, m.from, '🔍 Analysing your plant, please wait...');
    const img = await downloadMedia(s, m.image.id);
    const d = await diagnose(s, img);
    await sendText(s, m.from, formatReply(d));
    const ts = new Date().toISOString();
    const key = `${m.from}/${ts}.jpg`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.BUCKET, Key: key, Body: Buffer.from(img.b64, 'base64'), ContentType: img.mime }));
    await db.send(new PutItemCommand({
      TableName: process.env.TABLE,
      Item: { phone: { S: m.from }, ts: { S: ts }, imageKey: { S: key }, data: { S: JSON.stringify(d) } }
    }));
    await db.send(new UpdateItemCommand({
      TableName: process.env.FARMERS, Key: { phone: { S: m.from } },
      UpdateExpression: 'SET lastSeen = :t, firstSeen = if_not_exists(firstSeen, :t) ADD scans :one',
      ExpressionAttributeValues: { ':t': { S: ts }, ':one': { N: '1' } }
    }));
  }
};
