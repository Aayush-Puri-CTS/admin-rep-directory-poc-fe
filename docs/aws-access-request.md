# AWS Access Request — Admin BFF Gateway + Lambda Authorizer (POC)

**Requesting:** access to deploy one CDK stack (`AdminBffGatewayAuthorizerStack`) via `cdk deploy`
from my own machine.
**What it is:** an API Gateway HTTP API + one Lambda (a JWT authorizer) in front of the
Admin BFF prototype
for the full design.

## Services & permissions needed

| Service                         | What I need to do                                                               | Why                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **CloudFormation**              | Create/update/delete/describe the stack                                         | CDK deploys everything as one CloudFormation stack — this is how `cdk deploy`/`diff`/`destroy` work under the hood |
| **Lambda**                      | Create/update/delete the authorizer function; manage its resource policy        | Deploys the JWT-verifying authorizer and lets API Gateway invoke it                                                |
| **API Gateway (HTTP API / v2)** | Create/update/delete the API, routes, integration, and authorizer               | Builds the Gateway + REQUEST authorizer + route to the BFF                                                         |
| **IAM**                         | Create/update/delete a role (and attach one inline policy) scoped to this stack | CloudFormation needs to create the Lambda's _execution_ role — CloudWatch Logs write access only, nothing else     |
| **S3**                          | Read/write on the CDK bootstrap asset bucket                                    | CDK uploads the Lambda's bundled code there before deploying it                                                    |
| **STS**                         | `GetCallerIdentity`                                                             | CDK resolves the account ID from this at synth time                                                                |
| **CloudWatch Logs**             | Read access to this Lambda's log group                                          | To confirm the authorizer's allow/deny decisions while testing — nothing else in the account                       |

## One-time setup (may already be done — please check first)

`cdk bootstrap` — provisions the CDK toolkit stack (the asset bucket above + a couple of IAM roles
CDK assumes during deploy). If this account/region is already bootstrapped for other CDK stacks,
nothing further is needed here; if not, this is a one-time action someone with broader IAM/S3
access will likely need to run, or grant me permission to run once.

## Scope / guardrails

- Happy to have all of the above scoped to this stack's resources (by name/tag) rather than
  account-wide — I don't know the exact auto-generated resource names until after the first
  deploy, so an initial deploy may need slightly broader access, tightened afterward.
- No VPC/EC2/EKS/ELB permissions requested or needed — that's explicitly out of scope in POC mode.
- Time-boxed is fine — this is a POC, not a standing deployment.

---

<details>
<summary>Optional: a starting least-privilege policy JSON</summary>

Exact resource ARNs for the Lambda/API Gateway can't be known before the first deploy (CDK
auto-generates suffixes), so this is intentionally scoped by service + region/account rather than
by exact resource name. Tighten to specific ARNs after the first successful deploy if desired.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationStack",
      "Effect": "Allow",
      "Action": "cloudformation:*",
      "Resource": "arn:aws:cloudformation:*:*:stack/AdminBffGatewayAuthorizerStack/*"
    },
    {
      "Sid": "LambdaAndApiGateway",
      "Effect": "Allow",
      "Action": ["lambda:*", "apigateway:*"],
      "Resource": "*"
    },
    {
      "Sid": "IamForLambdaExecutionRole",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:TagRole"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CdkAssetBucket",
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::cdk-*", "arn:aws:s3:::cdk-*/*"]
    },
    {
      "Sid": "StsAndLogs",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity",
        "logs:GetLogEvents",
        "logs:FilterLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ],
      "Resource": "*"
    }
  ]
}
```

</details>
