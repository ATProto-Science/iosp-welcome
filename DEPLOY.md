# Deployment

This is a static site. It can be hosted via github pages or another method. To use github pages, the main files can either be moved from `public/` to `docs/` or use we can use GitHub Actions via `.github/workflows/pages.yml`.

## URLs must be updated

The URLs in `public/client-metadata.json` and `public/config.js` need to reflect the host URL for login and signup to work properly. They are currently set assuming pure atscience github project pages.

- Site: `https://atproto-science.github.io/iosp-kiosk/`
- Metadata: `https://atproto-science.github.io/iosp-kiosk/client-metadata.json`
- OAuth callback: `https://atproto-science.github.io/iosp-kiosk/welcome.html`

## Pre-release checklist

- Set the test event reference in `public/config.js`, then confirm an RSVP record exists after login or signup.
- Modify the Airglow automation to use the event and RSVP status instead of sifa and youandme.
