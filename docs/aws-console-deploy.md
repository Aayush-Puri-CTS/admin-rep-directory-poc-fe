# Deploying the Gateway + Lambda Authorizer via the AWS Console (no CloudFormation)

Alternative to [`infra/`](../infra) (the CDK stack) — click-through steps for the same POC
architecture (see [`docs/aws-api-gateway-lambda-authorizer.md`](./aws-api-gateway-lambda-authorizer.md)),
using only the Lambda and API Gateway consoles. No CloudFormation, no `iam:CreateRole` via a
stack — the console creates the Lambda's execution role for you as part of function creation.

**Console labels drift between AWS releases — if a field name below doesn't match what you see,
look for the concept (parameter mapping, identity source, etc.), not the exact wording.** Every
step also lists the equivalent CLI command, which is more stable and doubles as a way to verify
what the console actually did.

## 0. The one thing you can't do in the console: bundle the code

The authorizer imports `jose` and is split across several TypeScript files — the console's inline
editor only accepts a single plain JS file, so it can't be pasted in directly. It needs bundling
into one file first. **Already done for you:**

```bash
cd lambda-authorizer
npm run build:console-zip
```

This produces `lambda-authorizer/tenant-jwt-authorizer.zip` (~12KB, one file: `index.mjs`, `jose`
bundled in). Re-run this command after any code change, before re-uploading in step 2.

## 1. Create the tenant manifest (if you haven't already)

Same requirement as the CDK path — see the previous access-request doc's context, or
`docs/aws-api-gateway-lambda-authorizer.md` §5.3. You need a real public URL serving JSON shaped
like the example below, with a real `issuer`/`clientId` behind it — see
[`docs/keycloak-test-realm-setup.md`](./keycloak-test-realm-setup.md) if you need to create a
realm/client to get those values (the shared QA realm is currently missing the client this repo
was built against):

```json
{
  "corenroll.admin.poc": {
    "tenantId": "corenroll",
    "brand": "CoreEnroll (POC)",
    "issuer": "https://qa-sso.corenroll.com/realms/Corenroll-Test",
    "keycloak": { "url": "https://qa-sso.corenroll.com", "realm": "Corenroll-Test", "clientId": "nuera-enrollment-proto" }
  }
}
```

## 2. Create the Lambda function

**Console:** Lambda → *Create function* → **Author from scratch**.
- Function name: `tenant-jwt-authorizer`
- Runtime: **Node.js 20.x**
- Architecture: `arm64` (cheaper; `x86_64` also works, no code change needed either way)
- Under **Change default execution role**: leave "Create a new role with basic Lambda permissions"
  selected — that role only needs CloudWatch Logs write access, which this default already grants.

After it's created:
- **Code** tab → **Upload from** → **.zip file** → select `lambda-authorizer/tenant-jwt-authorizer.zip`.
- **Runtime settings** → **Edit** → confirm **Handler** is `index.handler` (Lambda resolves this
  against `index.mjs` and treats it as ESM automatically from the `.mjs` extension).
- **Configuration → Environment variables** → add:
  - `TENANT_MANIFEST_URL` = the public URL from step 1
  - `TENANT_MANIFEST_CACHE_TTL_SECONDS` = `300` (optional, this is the default anyway)
- **Configuration → General configuration** → set **Timeout** to `5` sec (default 3s is tight for
  a cold JWKS fetch).

**Equivalent CLI** (if you'd rather verify/redo this non-interactively):
```bash
aws lambda create-function \
  --function-name tenant-jwt-authorizer \
  --runtime nodejs20.x \
  --architectures arm64 \
  --handler index.handler \
  --timeout 5 \
  --zip-file fileb://lambda-authorizer/tenant-jwt-authorizer.zip \
  --role <execution-role-arn-from-the-console-created-role> \
  --environment "Variables={TENANT_MANIFEST_URL=<your-manifest-url>,TENANT_MANIFEST_CACHE_TTL_SECONDS=300}"
```

## 3. Create the HTTP API

**Console:** API Gateway → *Create API* → **HTTP API** → *Build*.
- Skip "Integrations" on this first screen (added in step 5) → **Next**.
- API name: `admin-bff-gateway` → **Next** → **Next** (accept default `$default` stage, auto-deploy
  **on**) → **Create**.

**CLI:**
```bash
aws apigatewayv2 create-api --name admin-bff-gateway --protocol-type HTTP
# note the ApiId returned — used in every command below
```

## 4. Add the Lambda authorizer

**Console:** on the API → **Authorization** (left nav) → **Create** → **Lambda** type.
- Authorizer name: `tenant-jwt-authorizer`
- Lambda function: select the one from step 2
- Identity source: `$request.header.Authorization`
- **Response format: `2.0` / "simple responses"** — this specific toggle is the one thing to get
  right; it's what makes the authorizer return `{isAuthorized: true/false}` instead of an IAM
  policy document. Look for a payload-format or "simple response" option in this screen.
- Authorizer caching: enable, TTL `300` seconds (or your preferred value — see the design doc §9).
- If the console offers to add the Lambda-invoke permission automatically, accept it. If it
  doesn't (or you're not sure it did), run the CLI command below — it's harmless to run twice.

**CLI (authorizer + the permission grant most likely to be missed):**
```bash
aws apigatewayv2 create-authorizer \
  --api-id <api-id> \
  --authorizer-type REQUEST \
  --name tenant-jwt-authorizer \
  --authorizer-uri arn:aws:apigateway:<region>:lambda:path/2015-03-31/functions/<lambda-function-arn>/invocations \
  --authorizer-payload-format-version 2.0 \
  --enable-simple-responses \
  --identity-source '$request.header.Authorization' \
  --authorizer-result-ttl-in-seconds 300

aws lambda add-permission \
  --function-name tenant-jwt-authorizer \
  --statement-id apigw-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:<region>:<account-id>:<api-id>/authorizers/<authorizer-id>"
```

**This permission grant is the single most common thing to miss** doing this by hand — without it,
every request 500s with an opaque "authorizer configuration" error, not a clean 401/403. If you hit
that, this is the first thing to check.

## 5. Add the route + integration to your BFF

**Console:** on the API → **Routes** → **Create**.
- Method: `ANY`, path: `/reps` → **Create**. Repeat for `/reps/{proxy+}`.
- For each route, attach an integration: **Attach integration** → **Create and attach an
  integration** → target type **HTTP URL** (not "Lambda function", not "Private resource" — that
  last one is the VPC Link path this POC is deliberately avoiding) → paste your BFF's public URL
  (see the tunnel setup from the earlier conversation if running it locally) → method `ANY`.
- On the route (or the integration, depending on console version): **Attach authorization** →
  select the `tenant-jwt-authorizer` authorizer created in step 4.

**Parameter mapping (the header overwrite) — find this on the Integration itself**, not the route:
API Gateway → your API → **Integrations** → select the one just created → look for a
**Parameter Mapping** section/tab. Add three mappings, all with mapping type **Overwrite**
(not *Append* — append would leave a client-forged header sitting alongside the real one):

| Parameter type | Name | Value |
|---|---|---|
| Header | `x-tenant-id` | `$context.authorizer.tenantId` |
| Header | `x-role` | `$context.authorizer.role` |
| Header | `x-party-id` | `$context.authorizer.partyId` |

**CLI** (route + integration + the parameter mapping in one `update-integration` call):
```bash
aws apigatewayv2 create-integration \
  --api-id <api-id> \
  --integration-type HTTP_PROXY \
  --integration-method ANY \
  --integration-uri <your-bff-public-url> \
  --payload-format-version 1.0 \
  --request-parameters '{
    "overwrite:header.x-tenant-id": "$context.authorizer.tenantId",
    "overwrite:header.x-role": "$context.authorizer.role",
    "overwrite:header.x-party-id": "$context.authorizer.partyId"
  }'
# note the IntegrationId returned

aws apigatewayv2 create-route \
  --api-id <api-id> \
  --route-key 'ANY /reps' \
  --target integrations/<integration-id> \
  --authorization-type CUSTOM \
  --authorizer-id <authorizer-id>

aws apigatewayv2 create-route \
  --api-id <api-id> \
  --route-key 'ANY /reps/{proxy+}' \
  --target integrations/<integration-id> \
  --authorization-type CUSTOM \
  --authorizer-id <authorizer-id>
```

## 6. CORS

**Console:** on the API → **CORS** → **Configure**.
- Allow origins: your exact dashboard origin(s) (e.g. `http://localhost:5173`) — **never** `*`.
- Allow headers: `Authorization`, `Content-Type`.
- Allow methods: `GET`, `POST`, `PATCH`, `DELETE`.

**CLI:**
```bash
aws apigatewayv2 update-api --api-id <api-id> --cors-configuration '{
  "AllowOrigins": ["http://localhost:5173"],
  "AllowHeaders": ["Authorization", "Content-Type"],
  "AllowMethods": ["GET", "POST", "PATCH", "DELETE"]
}'
```

## 7. Test it

The API's invoke URL is on the API's main console page (also `aws apigatewayv2 get-api --api-id <api-id>`).

```bash
# No token -> 401/403 from the authorizer, not the BFF
curl -i https://<api-id>.execute-api.<region>.amazonaws.com/reps

# Check what actually happened
aws logs tail /aws/lambda/tenant-jwt-authorizer --since 5m
```

The full success path still needs a real, valid Keycloak token — see the earlier conversation
about the still-open "Client not found" blocker for that.

## What you get vs. the CDK path

Same running result — one HTTP API, one Lambda authorizer, the same header-overwrite mapping. What
you *don't* get by skipping CloudFormation: no `cdk diff` to preview changes before making them, no
single `cdk destroy` to tear everything down (delete the API and the function separately), and no
record of *what* was configured beyond what you remember doing — worth writing down each value you
enter above somewhere, since there's no template to re-read later.
