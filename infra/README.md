# admin-bff-gateway-infra

AWS CDK (v2, TypeScript) stack for the API Gateway + Lambda Authorizer described in
[`docs/aws-api-gateway-lambda-authorizer.md`](../docs/aws-api-gateway-lambda-authorizer.md). One
stack, `ApiGatewayAuthorizerStack` (`lib/api-gateway-authorizer-stack.ts`), with **two ways to
reach the BFF** — pick based on what you actually have access to:

| | POC mode (`bffPublicUrl`) | Production mode (`vpcId`/`nlbListenerArn`/`nlbSecurityGroupId`) |
|---|---|---|
| Needs | API Gateway + Lambda access only | Also needs the BFF already running on EKS with an internal NLB in front of it |
| How it reaches the BFF | Direct `HttpUrlIntegration` to any public URL | `VpcLink` + `HttpNlbIntegration` — no public exposure |
| AWS resources created | None beyond the HTTP API + Lambda | Also a `VpcLink` (references your VPC/SG, creates nothing in EKS) |
| Use for | Verifying the Gateway/Authorizer logic itself, with a throwaway or non-PHI BFF instance | Anything handling real PHI |

**The two modes are mutually exclusive** — the stack throws a clear error at synth time if you
pass both `bffPublicUrl` and any of the VPC props, or neither.

Whichever mode, the stack always builds:

- An HTTP API (v2), CORS restricted to exact configured origins (never `*`).
- A Lambda REQUEST authorizer running `../lambda-authorizer` (bundled directly from its TypeScript
  source via `NodejsFunction`/esbuild — no separate build/publish step needed first).
- Header parameter mapping that **overwrites** (never merges/appends) `X-Tenant-Id`, `X-Role`,
  `X-Party-Id` from the authorizer's context on every request — this is the one control that
  matters most, and it's identical in both modes; a POC is no excuse to skip it.

## POC mode — no EKS/VPC access needed

If you only have API Gateway + Lambda access, point `bffPublicUrl` at wherever the BFF happens to
be reachable — an EC2 instance's public DNS, an App Runner/Fargate public endpoint, or a tunnel
(ngrok, Cloudflare Tunnel) to a machine running it locally. No VPC, VpcLink, security group, or NLB
resource is created in this mode.

```bash
npm install
npx cdk synth \
  -c bffPublicUrl=http://<wherever-the-bff-is-reachable>:3000 \
  -c tenantManifestUrl=https://<distribution>.cloudfront.net/tenant-registry.json \
  -c corsAllowedOrigins=https://corenroll.admin.example,https://iha.admin.example
```

**Do not use POC mode for anything handling real PHI.** It reintroduces the publicly-reachable-BFF
exposure that the VPC Link exists to close in the first place — fine for proving the
Gateway/Authorizer wiring works, not a substitute for the production path below.

## Production mode — VPC Link to an internal NLB in front of EKS

Requires the BFF already running on EKS with an internal NLB in front of it (per the design doc
§5.5, provisioned by the AWS Load Balancer Controller from a Kubernetes `Service` manifest — **not**
by this stack; coordinate with whoever owns the EKS cluster manifests for that side).

```bash
npx cdk synth \
  -c vpcId=vpc-0123456789abcdef0 \
  -c nlbListenerArn=arn:aws:elasticloadbalancing:...:listener/net/... \
  -c nlbSecurityGroupId=sg-0123456789abcdef0 \
  -c tenantManifestUrl=https://<distribution>.cloudfront.net/tenant-registry.json \
  -c corsAllowedOrigins=https://corenroll.admin.example,https://iha.admin.example
```

## What this stack never creates, in either mode

- **The tenant manifest and its CloudFront distribution.** Per `spec/MULTI_TENANT_INTEGRATION.md`
  §2, that's a separate static S3+CloudFront publishing pipeline, out of scope here. This stack
  only takes its resulting public URL as input (`tenantManifestUrl`).
- **The VPC itself**, in production mode — looked up by ID (`vpcId`), not created.
- **The BFF itself**, in either mode — this stack only routes to it.

## Prerequisites

- AWS credentials configured (`aws configure` / SSO / whatever your org uses). POC mode needs these
  only for the Lambda/API Gateway resources this stack actually creates; production mode also needs
  them for the `ec2.Vpc.fromLookup` context lookup at synth time.
- This account/region already [bootstrapped](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) for CDK (`cdk bootstrap`), if not already done for other stacks.
- The tenant manifest already published to S3/CloudFront, with an `issuer` field added to each
  tenant's entry (design doc §5.3/Step 1) — the Lambda expects that field; without it, every
  request from that tenant is denied as an "unknown issuer".
- Production mode only: the NLB (and its listener ARN + security group) already exists, per the
  note above.

## Full CDK context reference

Pass these with `-c key=value` on every `cdk` command (or put them in `cdk.context.json`, which is
gitignored here — don't commit real account-specific values into `cdk.json` itself):

| Context key | Mode | Example | Source |
|---|---|---|---|
| `bffPublicUrl` | POC | `http://admin-poc-bff.example.com:3000` | Wherever you've made the BFF reachable — see POC mode above. |
| `vpcId` | Production | `vpc-0123456789abcdef0` | The VPC the EKS cluster runs in. |
| `nlbListenerArn` | Production | `arn:aws:elasticloadbalancing:...:listener/net/...` | The internal NLB's listener ARN — get this from the EKS-side team/manifests. |
| `nlbSecurityGroupId` | Production | `sg-0123456789abcdef0` | Security group attached to that NLB. |
| `tenantManifestUrl` | Both | `https://<distribution>.cloudfront.net/tenant-registry.json` | The manifest's public CloudFront URL. |
| `corsAllowedOrigins` | Both | `https://corenroll.admin.example,https://iha.admin.example` | Comma-separated, **exact** dashboard origins — sourced from the same tenant manifest's hostnames (design doc Step 5); keep in sync by hand today, there's no automation wiring this up yet. |
| `manifestCacheTtlSeconds` | Both, optional | `300` | See design doc §9. |
| `authorizerResultTtlSeconds` | Both, optional | `300` | See design doc §9. Max `3600` (API Gateway limit). |

`npx cdk diff -c ...` / `npx cdk deploy -c ...` take the same context flags as `synth`.

## Verified

Both modes have been synthesized locally to confirm the full construct graph — authorizer config,
the correct integration type per mode (`HTTP_PROXY` direct in POC mode, `VPC_LINK` in production
mode), and the critical `overwrite:header.*` parameter mapping in both — render into a coherent
CloudFormation template with no synthesis errors, and that supplying both/neither of the two modes'
props fails fast with a clear error. Production mode's `Vpc.fromLookup` context lookup was checked
separately with a temporary attribute-based VPC reference, since it needs real AWS credentials this
sandbox doesn't have. **Nothing has been deployed against a real AWS account** — do that in a
non-production environment first, in whichever mode matches what you actually have access to.
