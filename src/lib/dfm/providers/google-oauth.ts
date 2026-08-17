import { readFile } from "node:fs/promises";

import { getEnv } from "@/lib/dfm/config/env";
import { fetchWithTimeout } from "@/lib/dfm/utils/fetch";

interface OAuthTokenFile {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
}

interface OAuthClientFile {
  installed?: {
    client_id?: string;
    client_secret?: string;
    token_uri?: string;
  };
}

async function readJsonFile<T>(path: string): Promise<T> {
  const content = await readFile(path, "utf8");
  return JSON.parse(content) as T;
}

function parseJsonString<T>(content: string, label: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON${error instanceof Error ? `: ${error.message}` : ""}`,
    );
  }
}

async function readJsonSource<T>(options: {
  filePath?: string;
  inlineJson?: string;
  label: string;
}): Promise<T> {
  if (options.inlineJson) {
    return parseJsonString<T>(options.inlineJson, options.label);
  }

  if (options.filePath) {
    return readJsonFile<T>(options.filePath);
  }

  throw new Error(`${options.label} is not configured`);
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  tokenUri: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetchWithTimeout(tokenUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  }, 15_000);

  if (!response.ok) {
    throw new Error(`Google OAuth token refresh failed with status ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google OAuth token refresh did not return an access token");
  }

  return data.access_token;
}

async function getAccessTokenFromFile(tokenFilePath: string): Promise<string> {
  return getAccessTokenFromSource({
    tokenFilePath,
  });
}

async function getAccessTokenFromSource(options: {
  tokenFilePath?: string;
  tokenInlineJson?: string;
}, clientOptions?: {
  clientFilePath?: string;
  clientInlineJson?: string;
  label?: string;
}): Promise<string> {
  const tokenFile = await readJsonSource<OAuthTokenFile>({
    filePath: options.tokenFilePath,
    inlineJson: options.tokenInlineJson,
    label: "Google OAuth token source",
  });
  const accessToken = tokenFile.access_token;
  const refreshToken = tokenFile.refresh_token;
  const expiryDate = tokenFile.expiry_date ?? 0;

  if (accessToken && expiryDate > Date.now() + 60_000) {
    return accessToken;
  }

  const env = getEnv();
  const clientFilePath = clientOptions?.clientFilePath ?? env.GOOGLE_OAUTH_CLIENT_FILE;
  const clientInlineJson = clientOptions?.clientInlineJson ?? env.GOOGLE_OAUTH_CLIENT_JSON;
  if (!refreshToken || (!clientFilePath && !clientInlineJson)) {
    throw new Error(
      "Google OAuth refresh requires a refresh token and either GOOGLE_OAUTH_CLIENT_FILE or GOOGLE_OAUTH_CLIENT_JSON",
    );
  }

  const clientFile = await readJsonSource<OAuthClientFile>({
    filePath: clientFilePath,
    inlineJson: clientInlineJson,
    label: clientOptions?.label ?? "GOOGLE_OAUTH_CLIENT source",
  });
  const clientId = clientFile.installed?.client_id;
  const clientSecret = clientFile.installed?.client_secret;
  const tokenUri = clientFile.installed?.token_uri ?? "https://oauth2.googleapis.com/token";

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client file is missing client credentials");
  }

  return refreshAccessToken(refreshToken, clientId, clientSecret, tokenUri);
}

export async function getGoogleGmailAccessToken(): Promise<string> {
  const env = getEnv();
  if (!env.GOOGLE_GMAIL_TOKEN_FILE && !env.GOOGLE_GMAIL_TOKEN_JSON) {
    throw new Error(
      "Either GOOGLE_GMAIL_TOKEN_FILE or GOOGLE_GMAIL_TOKEN_JSON must be configured",
    );
  }
  return getAccessTokenFromSource({
    tokenFilePath: env.GOOGLE_GMAIL_TOKEN_FILE,
    tokenInlineJson: env.GOOGLE_GMAIL_TOKEN_JSON,
  });
}

export async function getGoogleSheetsAccessToken(): Promise<string> {
  const env = getEnv();
  if (!env.GOOGLE_SHEETS_TOKEN_FILE && !env.GOOGLE_SHEETS_TOKEN_JSON) {
    throw new Error(
      "Either GOOGLE_SHEETS_TOKEN_FILE or GOOGLE_SHEETS_TOKEN_JSON must be configured",
    );
  }
  return getAccessTokenFromSource({
    tokenFilePath: env.GOOGLE_SHEETS_TOKEN_FILE,
    tokenInlineJson: env.GOOGLE_SHEETS_TOKEN_JSON,
  });
}

export async function getGoogleDriveAccessToken(): Promise<string> {
  const env = getEnv();
  if (!env.GOOGLE_DRIVE_TOKEN_FILE && !env.GOOGLE_DRIVE_TOKEN_JSON) {
    throw new Error(
      "Either GOOGLE_DRIVE_TOKEN_FILE or GOOGLE_DRIVE_TOKEN_JSON must be configured",
    );
  }
  return getAccessTokenFromSource({
    tokenFilePath: env.GOOGLE_DRIVE_TOKEN_FILE,
    tokenInlineJson: env.GOOGLE_DRIVE_TOKEN_JSON,
  }, {
    clientFilePath: env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE,
    clientInlineJson: env.GOOGLE_DRIVE_OAUTH_CLIENT_JSON,
    label: "GOOGLE_DRIVE_OAUTH_CLIENT source",
  });
}
