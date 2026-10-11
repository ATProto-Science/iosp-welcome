# Own your research network with AT Protocol — IOSP 2026 workshop

This site is linked from the IOSP workshop dashboard. Attendees arrive with a temporary Atmosphere account from IOSP check-in on the SciOS PDS.

The flow:
1. **Sign in** with the account they already have from check-in (or any other Atmosphere account), or **sign up with Aster**. Signup creates a real account on the Aster PDS using the workshop's single multi-use invite code.
2. **Mark attendance**, which writes a public `community.lexicon.calendar.rsvp` record with status `#going` to their own account. Airglow watches that collection, filters on `subject.uri` and status, and adds the author's DID to the conference curation list behind the feed.
3. **Account details**, explaining that the DID is permanent while handle and host can change, and offering to move a non-Aster account to Aster.
4. **Stations**. Each station can describe itself and post its own notes or embeds here.
5. **Conference feed** and the **participant list** from the public ATScience Bluesky list.

## Development

1. Serve the site: `npm start`, or `npx http-server docs -a 127.0.0.1 -p 8765 -c-1`.
2. Check formatting after editing: `npm run format` / `npm run format:check`.

## Configuration

`docs/config.js` holds the deployment-specific values:

- `asterPdsHost` — the Aster PDS signup creates accounts on. Until it is set, the Aster choice explains that signup is not configured yet.
- `asterHandleSuffix` — handle suffix offered during Aster signup (`.aster.id`).
- `asterInviteCode` — the workshop's single multi-use invite code. It is embedded in client-side JS, so it must be safe to publish and share.
- `eventUri` / `eventCid` / `rsvpRkey` — the event the RSVP points at.
- `sembleCollectionUri` — the workshop's open Semble collection, previewed in the Semble station.

The Aster PDS must allow CORS from the deployed origin.

## Semble collection preview

The Semble station lists the newest links in `sembleCollectionUri`. Cards are joined to a collection
by `network.cosmik.collectionLink` records, and each record lives in the repo of whoever added the
card — so an **open** collection carries no card list of its own and can't be read from the
collection record alone. Membership is only discoverable through a backlink index:

1. **Constellation** (`constellation.microcosm.blue`) returns the `collectionLink` records pointing
   at the collection, newest-first ordering left to the caller.
2. **Slingshot** (`slingshot.microcosm.blue`) hydrates each pointer into the link record, then into
   the card it references, and resolves the owner handles used in the "open the collection" link.

Both are unauthenticated and send permissive CORS headers, so the page can call them directly.
The preview shows the four newest cards in a grid — one column on a phone, two on a laptop — and only
loads when the Semble tab is opened. Until the collection has its first card it shows the collection's
own description instead.

The preview is styled to match Semble's own collection cards rather than this page's editorial
system — 16px card radius over a 1px `#dee2e6` border, a square thumbnail, warm ink, pill badges —
so it reads as a window into Semble. The "View the full collection" pill uses Semble's own accent
(`#ff6400`, their `--mantine-primary-color-filled`) with a white label, matching Semble's buttons —
that pairing is 2.98:1, below AA at this label size, and is deliberate rather than an oversight.
The styling needs Hanken Grotesk, which Semble uses and this page
otherwise doesn't; it's self-hosted in `docs/fonts/` with its OFL licence alongside the others, and
the browser only fetches it once the Semble panel is shown.

## TODO

1. **Station copy.** Each station tab has a one-line description and its lead. The description is a placeholder based on SciOS workshop listing.
2. **Confirm account creation.** Link to portal (TOS+Privacy) and invite code.
3. **Migration step.** "Move my account to Aster" opens an explanation screen. Add the real migration instructions or link when they exist.
4. **Configure Airglow.** Watch `community.lexicon.calendar.rsvp`, filter `subject.uri` to the event and status to `#going`; the action adds the record author's DID to the conference list.

## Scope

- OAuth only requests `atproto` (required for all atproto logins) and create+update+delete permission for RSVP records.
- The direct signup path uses the new account's returned session token only in memory to manage its RSVP; refresh means signing in again via OAuth.
