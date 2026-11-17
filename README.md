# CropGuard AI
WhatsApp bot for African farmers: send a photo of a sick plant, get the disease and treatment in seconds.

## Setup
1. Save secrets in SSM as SecureString under `/cropguard/`: `OPENAI_KEY`, `WA_TOKEN`, `WA_PHONE_ID`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`
   `aws ssm put-parameter --name /cropguard/OPENAI_KEY --type SecureString --value <key>`
2. Deploy: `sam build` then `sam deploy --guided`
3. Meta App > WhatsApp > Configuration: callback URL = `WebhookUrl` output, verify token = `WA_VERIFY_TOKEN`, subscribe to `messages`.
4. Send a plant photo to your WhatsApp number.
