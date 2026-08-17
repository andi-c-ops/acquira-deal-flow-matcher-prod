import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type OAuthClient = {
  installed?: {
    client_id?: string;
    client_secret?: string;
    auth_uri?: string;
    token_uri?: string;
  };
};

function required(value: string | undefined, label: string) {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

async function main() {
  const clientPath = required(process.env.GOOGLE_OAUTH_CLIENT_FILE, "GOOGLE_OAUTH_CLIENT_FILE");
  const outputPath = required(process.env.GOOGLE_DRIVE_TOKEN_OUTPUT_FILE, "GOOGLE_DRIVE_TOKEN_OUTPUT_FILE");
  const port = Number(process.env.GOOGLE_DRIVE_AUTH_PORT ?? "8787");
  const redirectUri = `http://localhost:${port}/oauth2/callback`;
  const client = JSON.parse(await readFile(clientPath, "utf8")) as OAuthClient;
  const installed = client.installed;
  const clientId = required(installed?.client_id, "OAuth client_id");
  const clientSecret = required(installed?.client_secret, "OAuth client_secret");
  const authUri = installed?.auth_uri ?? "https://accounts.google.com/o/oauth2/auth";
  const tokenUri = installed?.token_uri ?? "https://oauth2.googleapis.com/token";

  const authorizationUrl = new URL(authUri);
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "https://www.googleapis.com/auth/drive.file");
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", redirectUri);
    if (requestUrl.pathname !== "/oauth2/callback") {
      response.writeHead(404).end("Not found");
      return;
    }

    const code = requestUrl.searchParams.get("code");
    const error = requestUrl.searchParams.get("error");
    if (error || !code) {
      response.writeHead(400, { "Content-Type": "text/plain" }).end("Google Drive authorization was not completed. You can close this tab.");
      server.close();
      process.exitCode = 1;
      return;
    }

    try {
      const tokenResponse = await fetch(tokenUri, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResponse.ok) {
        throw new Error(`Google token exchange failed with status ${tokenResponse.status}`);
      }

      const token = await tokenResponse.json();
      await mkdir(dirname(resolve(outputPath)), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
      response.writeHead(200, { "Content-Type": "text/plain" }).end("Google Drive authorization is complete. You can close this tab and return to Codex.");
      console.log(`Google Drive token saved to ${outputPath}`);
    } catch (authorizationError) {
      response.writeHead(500, { "Content-Type": "text/plain" }).end("Authorization failed. Return to Codex for the error details.");
      console.error(authorizationError);
      process.exitCode = 1;
    } finally {
      server.close();
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log("Open this URL in the Acquira Google account to authorize the private Drive snapshot:");
    console.log(authorizationUrl.toString());
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
