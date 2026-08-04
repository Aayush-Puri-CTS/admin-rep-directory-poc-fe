#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { ApiGatewayAuthorizerStack } from '../lib/api-gateway-authorizer-stack';

const app = new App();

function optionalStringContext(key: string): string | undefined {
  return app.node.tryGetContext(key) as string | undefined;
}

function requireContext(key: string): string {
  const value = optionalStringContext(key);
  if (!value) {
    throw new Error(
      `Missing required CDK context value "${key}" — pass it with -c ${key}=... ` +
        `(see infra/README.md for the full list and where each value comes from).`,
    );
  }
  return value;
}

function optionalNumberContext(key: string): number | undefined {
  const value = app.node.tryGetContext(key);
  return value === undefined ? undefined : Number(value);
}

const corsOriginsRaw = requireContext('corsAllowedOrigins');

// Two mutually exclusive ways to reach the BFF — see lib/api-gateway-authorizer-stack.ts's own
// props doc and infra/README.md's "POC mode" section:
const bffPublicUrl = optionalStringContext('bffPublicUrl');
const vpcId = optionalStringContext('vpcId');
const nlbListenerArn = optionalStringContext('nlbListenerArn');
const nlbSecurityGroupId = optionalStringContext('nlbSecurityGroupId');

new ApiGatewayAuthorizerStack(app, 'AdminBffGatewayAuthorizerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  bffPublicUrl,
  vpcId,
  nlbListenerArn,
  nlbSecurityGroupId,
  tenantManifestUrl: requireContext('tenantManifestUrl'),
  corsAllowedOrigins: corsOriginsRaw.split(',').map((origin) => origin.trim()),
  manifestCacheTtlSeconds: optionalNumberContext('manifestCacheTtlSeconds'),
  authorizerResultTtlSeconds: optionalNumberContext('authorizerResultTtlSeconds'),
});
