# IOSP Conference Kiosk

One QR code for everyone opens this static onboarding site for the IOSP conference. This is the expected flow:
1. An attendee signs in with an existing Atmosphere account, or creates an account on the temporary (no invite codes required) event PDS. 
2. They are prompted to mark their attendance with an explanation that this writes a record to their account. a. On marking they'll be there, we write a `community.lexicon.calendar.rsvp` record to the attendee's account b. Airglow watches for that collection, filters by `subject.uri` and status, and adds the record author's DID to the atproto.science conference list
3. Account details are shown on the right with an explanation that DID is permanent, handle and host can change.
4. The rest of the welcome page has
    - links to workshop sites -> currently just has placeholders
    - a public Bluesky feed with a post compose button
    - shows the public IOSP attendees list

We can add additional Atmospheric components in the right panel with graze as sort of tabs: one for the feed, one for an open Semble collection for the conference, and any others that seem particularly suitable.

## Development

1. Serve the docs site locally to test login/signup. e.g., `npx http-server docs -a 127.0.0.1 -p 8765 -c-1` or just `npm start`.
2. Format css, html, json, and js files after editing: `npm run format`

## TODO List

1. **Settle deployment method and URL.** See [DEPLOY.md](DEPLOY.md) for details.
2. **Configure Airglow.** Watch `community.lexicon.calendar.rsvp`, filtering `subject.uri` to the event and `status` to `community.lexicon.calendar.rsvp#going`; the action adds the record author's DID to the conference list.
3. **Confirm account creation.** The current path creates an account directly at `https://memo.dog` with no invite code and fails because invite codes are required. To use another PDS instead, modify the account-creation requirements (handle suffix, email verification, password policy, CORS) and edit `config.js` accordingly.
4. **Setup migration link path.** Right now the link does nothing.

## Scope

- OAuth only requests `atproto` (required for all atproto logins) and create+update+delete permission for RSVP records.
- The direct signup path uses the new account's returned session token only in memory to manage its RSVP; refresh means signing in again via OAuth.
