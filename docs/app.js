import { Agent } from "https://esm.sh/@atproto/api@0.13";
import { config } from "./config.js";
import { restoreSession, startLogin } from "./oauth.js";

const $ = (id) => document.getElementById(id);
const collection = "community.lexicon.calendar.rsvp";
const listUri = "at://did:plc:nncebyouba4ex3775syiyvjy/app.bsky.graph.list/3mvyb5kkp6i2w";
let selectedPath;
let account;
let participantCursor;
let participantCount = 0;
let participantsLoaded = false;
let participantsLoading = false;
let participantsExpanded = false;
let participantError = false;
const participantPreviewCount = 8;
const participantDids = new Set();

function show(id) {
  for (const screen of document.querySelectorAll(".screen")) screen.hidden = screen.id !== id;
  $("sign-out").hidden = id !== "joined" && id !== "migration";
  $(id).querySelector("h1")?.focus();
  window.scrollTo(0, 0);
}

function errorMessage(error) {
  return error?.message || "Please try again.";
}

function eventReady() {
  return Boolean(config.eventUri && config.eventCid && config.rsvpRkey);
}

function rsvpRecord() {
  return {
    $type: collection,
    subject: { uri: config.eventUri, cid: config.eventCid },
    status: `${collection}#going`,
  };
}

async function saveRsvp() {
  const current = account;
  if (!current) return;
  const status = $("rsvp-status");
  const retry = $("retry-rsvp");
  retry.hidden = true;
  status.hidden = !eventReady();
  if (!eventReady()) return;
  status.textContent = "Checking your RSVP…";
  try {
    const existing = await current.getRecord();
    if (current !== account) return;
    if (existing?.value?.subject?.uri !== config.eventUri || existing?.value?.status !== `${collection}#going`) {
      await current.putRecord(rsvpRecord());
    }
    if (current !== account) return;
    status.textContent = "Your RSVP is saved. The participant list may take a moment to update.";
  } catch (error) {
    if (current !== account) return;
    status.textContent = `Your account is ready, but the RSVP could not be saved: ${errorMessage(error)}`;
    retry.hidden = false;
  }
}

async function welcome({ did, handle, getRecord, putRecord, session }) {
  account = { did, getRecord, putRecord, session };
  $("joined-handle").textContent = handle ? `@${handle.replace(/^@/, "")}` : did;
  $("migration-link").hidden = Boolean(handle?.endsWith(".aster.id"));
  $("password").value = "";
  show("joined");
  if (!$("conference-feed").src) $("conference-feed").src = $("conference-feed").dataset.src;
  if (!participantsLoaded) loadParticipants();
  await saveRsvp();
}

async function welcomeOAuth(session) {
  const agent = new Agent(session);
  const did = session.did;
  let handle;
  try {
    const issuer = (await session.getTokenInfo()).aud.replace(/\/$/, "");
    const response = await fetch(`${issuer}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`);
    if (response.ok) handle = (await response.json()).handle;
  } catch {
    /* The DID still identifies the account if lookup fails. */
  }
  return welcome({
    did,
    handle,
    session,
    async getRecord() {
      try {
        const response = await agent.com.atproto.repo.getRecord({ repo: did, collection, rkey: config.rsvpRkey });
        return response.data;
      } catch (error) {
        if (
          error.status === 404 ||
          (error.status === 400 && (error.error === "RecordNotFound" || error.message?.includes("Could not locate record:")))
        )
          return null;
        throw error;
      }
    },
    putRecord: (record) => agent.com.atproto.repo.putRecord({ repo: did, collection, rkey: config.rsvpRkey, record }),
  });
}

async function pdsRequest(path, token, body) {
  const url = `${config.temporaryPds.replace(/\/$/, "")}/xrpc/${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
}

async function welcomeTemporary(data) {
  const { did, handle, accessJwt } = data;
  return welcome({
    did,
    handle,
    async getRecord() {
      const params = new URLSearchParams({ repo: did, collection, rkey: config.rsvpRkey });
      const response = await fetch(`${config.temporaryPds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
      if (response.status === 404) return null;
      if (response.status === 400) {
        const body = await response.json();
        if (body.error === "RecordNotFound" || body.message?.startsWith("Could not locate record:")) return null;
        throw new Error(body.message || `Could not check RSVP (HTTP 400)`);
      }
      if (!response.ok) throw new Error(`Could not check RSVP (HTTP ${response.status})`);
      return response.json();
    },
    putRecord: (record) => pdsRequest("com.atproto.repo.putRecord", accessJwt, { repo: did, collection, rkey: config.rsvpRkey, record }),
  });
}

async function createTemporaryAccount() {
  const prefix = $("handle").value.trim().toLowerCase();
  const handle = `${prefix}${config.temporaryHandleSuffix}`;
  const response = await fetch(`${config.temporaryPds.replace(/\/$/, "")}/xrpc/com.atproto.server.createAccount`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, email: `${prefix}@memo.dog`, password: $("password").value }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  if (!data.did || !data.accessJwt) throw new Error("Account created, but no session was returned. Sign in with your new handle.");
  await welcomeTemporary(data);
}

for (const button of document.querySelectorAll("[data-path]")) {
  button.addEventListener("click", () => {
    selectedPath = button.dataset.path;
    const temporary = selectedPath === "temporary";
    $("identity-title").textContent = temporary ? "Get a temporary account" : "Sign in to IOSP";
    $("identity-explanation").textContent = temporary ? "A temporary account for IOSP workshops." : "Use Bluesky or another Atmosphere account.";
    $("handle-label").textContent = temporary ? "Choose a handle" : "Your handle";
    $("handle").placeholder = temporary ? "yourname" : "you.bsky.social";
    if (temporary) $("handle").pattern = "[a-zA-Z0-9-]+";
    else $("handle").removeAttribute("pattern");
    $("handle").value = "";
    $("handle-suffix").textContent = config.temporaryHandleSuffix;
    $("handle-suffix").hidden = !temporary;
    $("signup-fields").hidden = !temporary;
    $("password").required = temporary;
    $("continue-label").textContent = temporary ? "Create account" : "Continue to sign in";
    $("form-status").hidden = true;
    show("identity");
  });
}

$("account-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("continue");
  const status = $("form-status");
  button.disabled = true;
  status.hidden = true;
  try {
    if (selectedPath === "temporary") await createTemporaryAccount();
    else await startLogin($("handle").value.trim().replace(/^@/, ""));
  } catch (error) {
    status.textContent = errorMessage(error);
    status.hidden = false;
  } finally {
    button.disabled = false;
  }
});

$("retry-rsvp").addEventListener("click", saveRsvp);
$("migration-link").addEventListener("click", () => show("migration"));
$("sign-out").addEventListener("click", async () => {
  const session = account?.session;
  account = null;
  show("choose");
  if (session) {
    try {
      await session.signOut();
    } catch (error) {
      console.warn("sign-out failed:", error);
    }
  }
});
for (const button of document.querySelectorAll("[data-go]")) button.addEventListener("click", () => show(button.dataset.go));

function renderParticipant(subject) {
  if (!subject?.did || participantDids.has(subject.did)) return;
  participantDids.add(subject.did);
  const link = document.createElement("a");
  link.className = "participant";
  link.href = `https://aturi.to/profile/${encodeURIComponent(subject.did)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const avatar = document.createElement("span");
  avatar.className = "participant-avatar";
  const initial = (subject.displayName || subject.handle || "?").charAt(0).toUpperCase();
  if (subject.avatar) {
    const image = document.createElement("img");
    image.src = subject.avatar;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      avatar.textContent = initial;
    });
    avatar.append(image);
  } else avatar.textContent = initial;
  const copy = document.createElement("span");
  copy.className = "participant-copy";
  const name = document.createElement("span");
  name.className = "participant-name";
  name.textContent = subject.displayName || subject.handle || subject.did;
  const handleText = document.createElement("span");
  handleText.className = "participant-handle";
  handleText.textContent = subject.handle ? `@${subject.handle}` : subject.did;
  copy.append(name, handleText);
  link.append(avatar, copy);
  $("participant-list").append(link);
  participantCount++;
  link.hidden = !participantsExpanded && participantCount > participantPreviewCount;
}

function updateParticipantView() {
  for (const [index, link] of [...$("participant-list").children].entries()) {
    link.hidden = !participantsExpanded && index >= participantPreviewCount;
  }
  const toggle = $("view-participants");
  toggle.hidden = !participantError && participantCount <= participantPreviewCount && !participantCursor;
  toggle.disabled = false;
  toggle.setAttribute("aria-expanded", String(participantsExpanded));
  toggle.textContent = participantError ? "Retry loading participants ↻" : participantsExpanded ? "Show fewer participants ↑" : "View full list ↓";
}

async function loadParticipants(all = false) {
  if (participantsLoading) return;
  participantsLoading = true;
  const status = $("participant-status");
  const toggle = $("view-participants");
  toggle.disabled = true;
  participantError = false;
  status.textContent = participantCount ? `${participantCount} participants loaded · loading more…` : "Loading participants…";
  try {
    do {
      const params = new URLSearchParams({ list: listUri, limit: "100" });
      if (participantCursor) params.set("cursor", participantCursor);
      const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.graph.getList?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      for (const item of data.items || []) renderParticipant(item.subject);
      if (data.cursor && data.cursor === participantCursor) throw new Error("Pagination did not advance");
      participantCursor = data.cursor || null;
      if (all && participantCursor) status.textContent = `${participantCount} participants loaded · loading more…`;
    } while (all && participantCursor);
    participantsLoaded = true;
    status.textContent = participantCursor
      ? `${participantCount} participants loaded`
      : `${participantCount} participant${participantCount === 1 ? "" : "s"} on the IOSP list`;
  } catch {
    participantError = true;
    status.textContent = "Could not load participants. Try again.";
  } finally {
    participantsLoading = false;
    updateParticipantView();
  }
}

$("view-participants").addEventListener("click", async () => {
  if (participantsExpanded && !participantError) {
    participantsExpanded = false;
    updateParticipantView();
    return;
  }
  participantsExpanded = true;
  updateParticipantView();
  if (participantCursor || !participantsLoaded) await loadParticipants(true);
});

window.addEventListener("message", (event) => {
  const iframe = $("conference-feed");
  if (event.source !== iframe.contentWindow || !["https://graze.social", "https://www.graze.social"].includes(event.origin)) return;
  if (!Array.isArray(event.data) || event.data[0] !== "setHeight" || event.data[1]?.id !== iframe.id) return;
  const height = Number(event.data[1].height);
  if (Number.isFinite(height) && height > 0) iframe.style.height = `${Math.min(Math.max(height, 420), 900)}px`;
});

const picker = $("app-picker");
$("open-feed").addEventListener("click", () => picker.showModal());
$("close-picker").addEventListener("click", () => picker.close());
picker.addEventListener("click", (event) => {
  if (event.target === picker) picker.close();
});
for (const link of picker.querySelectorAll("a")) link.addEventListener("click", () => picker.close());

$("disclosure").hidden = !eventReady();
try {
  const result = await restoreSession();
  if (result) await welcomeOAuth(result.session);
} catch (error) {
  $("form-status").textContent = `Could not restore sign-in: ${errorMessage(error)}`;
  $("form-status").hidden = false;
  show("identity");
}
