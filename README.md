# IOSP Conference Kiosk

One QR code for everyone opens this static onboarding site for the IOSP conference. This is the expected flow:
1. An attendee signs in with an existing Atmosphere account, or creates an account on the temporary (no invite codes required) event PDS. a. The site writes a `community.lexicon.calendar.rsvp` record to the attendee's own account. b. Airglow watches for that collection, filters by `subject.uri` and status, and adds the record author's DID to the atproto.science conference list.
2. People land on a welcome page with 
    - an Aster migration link (redirect there needs to be modified)
    - links to workshop sites -> currently just has placeholders
    - shows a public Bluesky feed
    - shows the public IOSP attendees/participants list

We can add additional Atmospheric components in the right panel with graze as sort of tabs: one for the feed, one for an open Semble collection for the conference, and any others that seem particularly suitable.

## Development

1. Serve the public site locally to test login/signup. e.g.,
  ```npx http-server public -a 127.0.0.1 -p 8765 -c-1```
2. Format css, html, json, and js files after editing: `npm run format`

## TODO List

1. **Settle deployment method and URL.** See [DEPLOY.md](DEPLOY.md) for details.
2. **Create the event reference.** Create a `community.lexicon.calendar.event` record on atmo.rsvp
3. **Choose the RSVP record key.** Keep `rsvpRkey` a valid 13-character TID; `putRecord` upserts one RSVP per attendee at this key.
4. **Configure Airglow.** Watch `community.lexicon.calendar.rsvp`, filtering `subject.uri` to the event and `status` to `community.lexicon.calendar.rsvp#going`; the action adds the record author's DID to the conference list.
5. **Confirm account creation.** The current path creates an account directly at `https://memo.dog` with no invite code and fails because invite codes are required. To use another PDS instead, modify the account-creation requirements (handle suffix, email verification, password policy, CORS) and edit `config.js` accordingly.

## Scope

- OAuth only requests `atproto` (required for all atproto logins) and create+update permission for RSVP records.
- The direct signup path uses the new account's returned session token only in memory to write its RSVP; refresh means signing in again via OAuth.
- The site uses relative paths throughout for GitHub Pages' `/iosp-kiosk/` prefix. A copy under a different origin needs the OAuth metadata and `config.js` updated together.
