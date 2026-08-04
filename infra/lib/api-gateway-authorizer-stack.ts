import path from 'path';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaAuthorizer, HttpLambdaResponseType } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpNlbIntegration, HttpUrlIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

// Implements docs/aws-api-gateway-lambda-authorizer.md. Every design decision cited by section
// number below is decided in that doc, not invented here — this stack just builds it.
//
// Two ways to reach the BFF, chosen by which props are supplied — see §5.5/Step 4:
//
// 1. VPC Link to an internal NLB in front of an EKS Service (`vpcId`/`nlbListenerArn`/
//    `nlbSecurityGroupId`) — the target production design. Requires EKS access to have already
//    stood up the NLB; this stack only imports it.
// 2. A direct public-URL HTTP integration (`bffPublicUrl`) — a POC-only shortcut for when EKS
//    isn't available yet but API Gateway + Lambda are. No VPC, VpcLink, or NLB resources are
//    created in this mode. **Not a substitute for #1 in anything handling real PHI** — see the
//    warning on `bffPublicUrl` below and infra/README.md.
export interface ApiGatewayAuthorizerStackProps extends StackProps {
  /** VPC the BFF's EKS cluster (and its internal NLB) lives in. Required with `nlbListenerArn`/
   * `nlbSecurityGroupId`; omit entirely when using `bffPublicUrl` instead. */
  readonly vpcId?: string;
  /** ARN of the internal NLB listener the AWS Load Balancer Controller created for the BFF's
   * EKS Service — see §5.5. This stack does not create the NLB; EKS/the LB Controller does. */
  readonly nlbListenerArn?: string;
  /** Security group attached to that NLB — the VPC Link's own SG must be allowed to reach it. */
  readonly nlbSecurityGroupId?: string;
  /**
   * POC-only alternative to the three VPC props above: a public HTTPS (or HTTP) URL the BFF is
   * directly reachable at — e.g. an EC2 instance's public DNS, an App Runner/Fargate public
   * endpoint, or a tunnel (ngrok/Cloudflare Tunnel) to a machine running it locally. Skips VPC
   * Link/NLB entirely, so it works with only API Gateway + Lambda access — no EKS, no VPC
   * resource of any kind is created in this mode.
   *
   * **Do not use this for anything handling real PHI.** It reintroduces exactly the
   * publicly-reachable-BFF exposure §5.5 exists to close, and skips the network-level isolation
   * a VPC Link provides. Fine for a POC verifying the Gateway/Authorizer wiring itself against a
   * throwaway or non-PHI BFF instance.
   */
  readonly bffPublicUrl?: string;
  /** The tenant manifest's public URL (the CloudFront distribution in front of the S3 object) —
   * see §5.3. The same file the SPA fetches, just re-indexed by issuer instead of hostname. */
  readonly tenantManifestUrl: string;
  /** Exact dashboard origins to allow via CORS — never `*`. See Step 5. Sourced from the same
   * tenant manifest's hostnames; pass explicitly here rather than re-deriving it in this stack,
   * so there's one clear place (the caller) responsible for keeping the two in sync. */
  readonly corsAllowedOrigins: string[];
  /** How often the Lambda's in-memory manifest cache is considered fresh, in seconds. One of
   * three independently configurable cache layers — see §9. @default 300 */
  readonly manifestCacheTtlSeconds?: number;
  /** How long API Gateway caches the authorizer's decision for a given token, in seconds.
   * Distinct from the manifest cache above — this caches a verdict, not manifest data. Max 3600
   * per the AWS API Gateway limit. See §9 for the tradeoff against revocation freshness.
   * @default 300 */
  readonly authorizerResultTtlSeconds?: number;
}

export class ApiGatewayAuthorizerStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiGatewayAuthorizerStackProps) {
    super(scope, id, props);

    const usingPublicUrl = !!props.bffPublicUrl;
    const usingVpcLink = !!(props.vpcId || props.nlbListenerArn || props.nlbSecurityGroupId);

    if (usingPublicUrl && usingVpcLink) {
      throw new Error(
        'Provide either bffPublicUrl (POC mode) OR vpcId/nlbListenerArn/nlbSecurityGroupId ' +
          '(VPC Link mode) — not both. Mixing them means the stack would build VPC resources it ' +
          'never actually routes traffic through.',
      );
    }
    if (!usingPublicUrl && !usingVpcLink) {
      throw new Error(
        'Provide either bffPublicUrl (POC mode) OR all three of vpcId/nlbListenerArn/' +
          'nlbSecurityGroupId (VPC Link mode). See infra/README.md.',
      );
    }
    if (usingVpcLink && !(props.vpcId && props.nlbListenerArn && props.nlbSecurityGroupId)) {
      throw new Error(
        'VPC Link mode requires all three of vpcId, nlbListenerArn, and nlbSecurityGroupId.',
      );
    }

    // --- The authorizer Lambda (§Step 2) --------------------------------------------------
    // Not attached to the VPC in either mode: it only talks to public endpoints (the tenant
    // manifest's CloudFront URL, and each tenant's public Keycloak JWKS endpoint) — no NAT/ENI
    // cost or cold-start latency for VPC attachment it doesn't need.
    const lambdaAuthorizerDir = path.join(__dirname, '..', '..', 'lambda-authorizer');

    const authorizerFn = new NodejsFunction(this, 'TenantJwtAuthorizerFn', {
      entry: path.join(lambdaAuthorizerDir, 'src', 'index.ts'),
      // lambda-authorizer/ is a sibling of this infra/ project, not nested under it — esbuild's
      // default project-root autodetection assumes the entry lives under the CDK app's own
      // root, so both of these must be pointed at lambda-authorizer's own package.json/lockfile
      // explicitly, or bundling fails with "PathNotUnderRoot".
      projectRoot: lambdaAuthorizerDir,
      depsLockFilePath: path.join(lambdaAuthorizerDir, 'package-lock.json'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(5),
      bundling: {
        format: OutputFormat.ESM,
        target: 'node20',
      },
      environment: {
        TENANT_MANIFEST_URL: props.tenantManifestUrl,
        TENANT_MANIFEST_CACHE_TTL_SECONDS: String(props.manifestCacheTtlSeconds ?? 300),
      },
      description: 'Verifies tenant Keycloak JWTs and maps issuer -> tenant_id; see docs/aws-api-gateway-lambda-authorizer.md',
    });

    const authorizer = new HttpLambdaAuthorizer('TenantJwtAuthorizer', authorizerFn, {
      authorizerName: 'tenant-jwt-authorizer',
      responseTypes: [HttpLambdaResponseType.SIMPLE],
      identitySource: ['$request.header.Authorization'],
      resultsCacheTtl: Duration.seconds(props.authorizerResultTtlSeconds ?? 300),
    });

    // Overwrite, never merge (§5.4) — any client-supplied X-Tenant-Id/X-Role/X-Party-Id must be
    // discarded before the authorizer's own values are set. Using overwriteHeader (not
    // appendHeader) is exactly what makes that true; do not change this to append. Applies in
    // both modes — a POC is no excuse to skip this control, it's the one this whole design
    // exists to enforce.
    const parameterMapping = new apigwv2.ParameterMapping()
      .overwriteHeader('x-tenant-id', apigwv2.MappingValue.contextVariable('authorizer.tenantId'))
      .overwriteHeader('x-role', apigwv2.MappingValue.contextVariable('authorizer.role'))
      .overwriteHeader('x-party-id', apigwv2.MappingValue.contextVariable('authorizer.partyId'));

    // --- Reaching the BFF (§5.5, §Step 4) -------------------------------------------------
    const bffIntegration = usingPublicUrl
      ? // POC mode: no VPC, VpcLink, or NLB resources at all — see the warning on
        // `bffPublicUrl` above. Free-tier ngrok tunnels show an interstitial warning page to
        // any request lacking this header — without it, API Gateway would get HTML back
        // instead of the BFF's response. Harmless against non-ngrok public URLs (EC2/App
        // Runner/Fargate just ignore an extra header they don't recognize).
        new HttpUrlIntegration('BffIntegration', props.bffPublicUrl as string, {
          parameterMapping: parameterMapping.overwriteHeader(
            'ngrok-skip-browser-warning',
            apigwv2.MappingValue.custom('true'),
          ),
        })
      : this.buildVpcLinkIntegration(props, parameterMapping);

    // --- The HTTP API itself (§5.1, §Step 3, §Step 5) -------------------------------------
    const httpApi = new apigwv2.HttpApi(this, 'AdminBffHttpApi', {
      apiName: 'admin-bff-gateway',
      description: 'Gateway + Lambda Authorizer in front of the Admin BFF — see docs/aws-api-gateway-lambda-authorizer.md',
      defaultAuthorizer: authorizer,
      corsPreflight: {
        // Exact origins only — never reflect an arbitrary Origin the way the BFF's own
        // app.enableCors() does today (spec/api-spec.md §3). See Step 5.
        allowOrigins: props.corsAllowedOrigins,
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
        ],
      },
    });

    // Only the Rep Directory API exists today (spec/api-spec.md §4) — add further domain-service
    // routes here as they come online, all through the same authorizer.
    httpApi.addRoutes({
      path: '/reps',
      methods: [apigwv2.HttpMethod.ANY],
      integration: bffIntegration,
    });
    httpApi.addRoutes({
      path: '/reps/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration: bffIntegration,
    });

    new CfnOutput(this, 'HttpApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'Invoke URL for the Admin BFF Gateway',
    });
    new CfnOutput(this, 'AuthorizerFunctionName', {
      value: authorizerFn.functionName,
    });
    new CfnOutput(this, 'BffIntegrationMode', {
      value: usingPublicUrl ? 'poc-public-url' : 'vpc-link',
    });
  }

  // The NLB and the EKS Service behind it are NOT created here — the AWS Load Balancer
  // Controller creates the NLB from a Kubernetes Service manifest in the EKS cluster. This
  // method only imports it by ARN and wires a VPC Link to it.
  private buildVpcLinkIntegration(
    props: ApiGatewayAuthorizerStackProps,
    parameterMapping: apigwv2.ParameterMapping,
  ): HttpNlbIntegration {
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: props.vpcId as string });

    const nlbSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'NlbSecurityGroup',
      props.nlbSecurityGroupId as string,
    );

    const vpcLink = new apigwv2.VpcLink(this, 'BffVpcLink', {
      vpc,
      securityGroups: [nlbSecurityGroup],
    });

    const nlbListener = elbv2.NetworkListener.fromNetworkListenerArn(
      this,
      'BffNlbListener',
      props.nlbListenerArn as string,
    );

    return new HttpNlbIntegration('BffIntegration', nlbListener, { vpcLink, parameterMapping });
  }
}
