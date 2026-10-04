import { BrowserOAuthClient } from "https://esm.sh/@atproto/oauth-client-browser@0.5.8";
import { config } from "./config.js";

export const scope =
  "atproto repo:community.lexicon.calendar.rsvp?action=create repo:community.lexicon.calendar.rsvp?action=update repo:community.lexicon.calendar.rsvp?action=delete";
let clientPromise;
const loopback = location.hostname === "127.0.0.1";
const redirectUri = loopback ? new URL("./welcome.html", location.href).href : new URL("./welcome.html", config.oauthClientId).href;

export function getClient() {
  if (!clientPromise) {
    if (loopback) {
      const clientId = new URL("http://localhost");
      clientId.searchParams.set("redirect_uri", redirectUri);
      clientId.searchParams.set("scope", scope);
      clientPromise = BrowserOAuthClient.load({
        clientId: clientId.href,
        handleResolver: "https://bsky.social",
      });
    } else {
      clientPromise = BrowserOAuthClient.load({
        clientId: config.oauthClientId,
        handleResolver: "https://bsky.social",
      });
    }
  }
  return clientPromise;
}

export async function startLogin(identifier) {
  const client = await getClient();
  await client.signIn(identifier, { scope, redirect_uri: redirectUri });
}

export async function restoreSession() {
  const client = await getClient();
  return client.init();
}
