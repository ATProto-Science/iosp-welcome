# Deployment

A static site served from `docs/`. Any static host works; the notes below assume GitHub Pages for the `atproto-science` org,.

## OAuth URLs must match the deployed origin

Three values have to agree with wherever the site actually lives:

- `client_id` in `docs/client-metadata.json`
- `oauthClientId` in `docs/config.js`
- the redirect URI in `redirect_uris` in `docs/client-metadata.json` (the site's `welcome.html`)

They are currently set for GitHub project pages:

- Site: `https://atproto-science.github.io/iosp-welcome/`
- Metadata: `https://atproto-science.github.io/iosp-welcome/client-metadata.json`
- OAuth callback: `https://atproto-science.github.io/iosp-welcome/welcome.html`

## Pre-release checklist

- Set `asterPdsHost` and `asterInviteCode` in `docs/config.js`.
- Confirm the Aster PDS allows CORS from the deployed origin and that signup with the invite code works from it.
- Sign up once and sign in once; confirm the RSVP record lands on the account and that Airglow adds the DID to the conference list.
- Confirm the feed iframe and the participant list load from the deployed origin.
