export type FederatedToken = {
  accessToken: string;
  expiresIn?: number;
};

export type ImpersonatedToken = {
  accessToken: string;
  expireTime?: string;
};

export type OidcClaims = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
};

type StsResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type IamCredentialsResponse = {
  accessToken?: string;
  expireTime?: string;
  error?: {
    message?: string;
    status?: string;
  };
};

export const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
export const DEFAULT_STS_TOKEN_URL = 'https://sts.googleapis.com/v1/token';

const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const JWT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:jwt';
const IAM_CREDENTIALS_BASE_URL = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts';
const AUDIENCE_PREFIX = '//iam.googleapis.com/';
const PROVIDER_PATTERN =
  /^(?:\/\/iam\.googleapis\.com\/)?projects\/[^/]+\/locations\/[^/]+\/workloadIdentityPools\/[^/]+\/providers\/[^/]+$/;

function parseJson<T>(rawBody: string): T {
  if (!rawBody.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    return {} as T;
  }
}

export function buildProviderAudience(providerResourceName: string): string {
  const trimmed = providerResourceName.trim();

  if (!PROVIDER_PATTERN.test(trimmed)) {
    throw new Error(
      'Invalid gcpWorkloadIdentityProvider. Expected ' +
        'projects/<PROJECT_NUMBER>/locations/<LOCATION>/workloadIdentityPools/<POOL>/providers/<PROVIDER>, ' +
        `optionally prefixed with ${AUDIENCE_PREFIX}. Received: ${trimmed}`
    );
  }

  return trimmed.startsWith(AUDIENCE_PREFIX) ? trimmed : `${AUDIENCE_PREFIX}${trimmed}`;
}

export function parseScopes(scopes: string | undefined): string[] {
  const parsed = (scopes ?? '')
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  return parsed.length > 0 ? parsed : [CLOUD_PLATFORM_SCOPE];
}

export function decodeJwtClaims(token: string): OidcClaims {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Cannot decode claims: token is not a JWT.');
  }

  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  const claims = parseJson<OidcClaims>(payload);

  return {
    iss: claims.iss,
    aud: claims.aud,
    sub: claims.sub,
    exp: claims.exp
  };
}

export async function exchangeOidcForFederatedToken(options: {
  audience: string;
  oidcToken: string;
  tokenUrl: string;
  scopes: string[];
}): Promise<FederatedToken> {
  const body = new URLSearchParams({
    audience: options.audience,
    grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
    requested_token_type: ACCESS_TOKEN_TYPE,
    scope: options.scopes.join(' '),
    subject_token_type: JWT_TOKEN_TYPE,
    subject_token: options.oidcToken
  }).toString();

  // The Security Token Service rejects requests that carry an Authorization header,
  // so this request is deliberately unauthenticated.
  const response = await fetch(options.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const rawBody = await response.text();
  const parsed = parseJson<StsResponse>(rawBody);

  if (!response.ok) {
    const details =
      parsed.error_description || parsed.error || rawBody || 'Unknown security token service error.';
    throw new Error(
      `Google token exchange failed (${response.status} ${response.statusText}): ${details}`
    );
  }

  const accessToken = parsed.access_token?.trim();
  if (!accessToken) {
    throw new Error('Google token exchange succeeded but access_token is missing.');
  }

  return { accessToken, expiresIn: parsed.expires_in };
}

export async function impersonateServiceAccount(options: {
  federatedToken: string;
  serviceAccountEmail: string;
  scopes: string[];
  lifetimeSeconds?: number;
}): Promise<ImpersonatedToken> {
  const requestUrl = `${IAM_CREDENTIALS_BASE_URL}/${encodeURIComponent(options.serviceAccountEmail)}:generateAccessToken`;
  const payload: { scope: string[]; lifetime?: string } = { scope: options.scopes };

  if (options.lifetimeSeconds !== undefined) {
    payload.lifetime = `${options.lifetimeSeconds}s`;
  }

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.federatedToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const rawBody = await response.text();
  const parsed = parseJson<IamCredentialsResponse>(rawBody);

  if (!response.ok) {
    const details = parsed.error?.message || rawBody || 'Unknown IAM Credentials error.';
    throw new Error(
      `Service account impersonation failed (${response.status} ${response.statusText}): ${details}`
    );
  }

  const accessToken = parsed.accessToken?.trim();
  if (!accessToken) {
    throw new Error('Service account impersonation succeeded but accessToken is missing.');
  }

  return { accessToken, expireTime: parsed.expireTime };
}
