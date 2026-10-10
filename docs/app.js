import { Agent } from "https://esm.sh/@atproto/api@0.13";
import { config } from "./config.js";
import { restoreSession, startLogin } from "./oauth.js";

const $ = (id) => document.getElementById(id);
const on = (id, type, handler) => $(id)?.addEventListener(type, handler);
const collection = "community.lexicon.calendar.rsvp";
const listUri = "at://did:plc:nncebyouba4ex3775syiyvjy/app.bsky.graph.list/3mvyb5kkp6i2w";
let selectedPath;
let account;
let participantCursor;
let participantsLoaded = false;
let participantsLoading = false;
let participantPage = 0;
let participantError = false;
const participantPageSize = 9;
const participantDids = new Set();

function show(id) {
  for (const screen of document.querySelectorAll(".screen")) screen.hidden = screen.id !== id;
  $("sign-out").hidden = id !== "joined";
  $(id).querySelector("h1")?.focus();
  window.scrollTo(0, 0);
}

function errorMessage(error) {
  return error?.message || "Please try again.";
}

// The configured Aster PDS, without a trailing slash.
const asterPds = () => config.asterPdsHost.replace(/\/+$/, "");

function originOf(value) {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).origin;
  } catch {
    return null;
  }
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

function checkedIn(existing) {
  return existing?.value?.subject?.uri === config.eventUri && existing?.value?.status === `${collection}#going`;
}

// Attending is deliberate: the RSVP record is only written when the attendee answers
// "Attending IOSP?" themselves. Airglow turns that record into participant-list membership.
function setAttendingUi(state, message) {
  $("attending-prompt").hidden = state === "attending";
  $("attending-result").hidden = state !== "attending";
  const visible = state === "attending" ? $("rsvp-result-status") : $("rsvp-status");
  const other = state === "attending" ? $("rsvp-status") : $("rsvp-result-status");
  other.hidden = true;
  visible.textContent = message || "";
  visible.hidden = !message;
}

function fillIdentity(handle, did) {
  const label = handle?.replace(/^@/, "");
  $("joined-handle").textContent = label || did;
}

async function loadAccount(did, handle) {
  const endpoint = await resolvePds(did);
  if (account?.did !== did) return; // Signed out or switched mid-lookup.
  showHost(endpoint, did, handle);
}

async function markAttending() {
  const current = account;
  if (!current) return;
  const yes = $("rsvp-yes");
  yes.disabled = true;
  setAttendingUi("ready");
  if (!eventReady()) {
    yes.disabled = false;
    setAttendingUi("ready", "Attending isn't open yet — ask a volunteer at the desk.");
    return;
  }
  try {
    const existing = await current.getRecord();
    if (current !== account) return; // Signed out or switched mid-check.
    if (!checkedIn(existing)) await current.putRecord(rsvpRecord());
    if (current !== account) return;
    yes.disabled = false;
    setAttendingUi("attending");
  } catch (error) {
    if (current !== account) return;
    yes.disabled = false;
    setAttendingUi("ready", `Couldn't save your RSVP: ${errorMessage(error)}`);
  }
}

let undoArmed = false;
let undoTimer;
function disarmUndo() {
  undoArmed = false;
  clearTimeout(undoTimer);
  const undo = $("rsvp-undo");
  if (undo) undo.textContent = "Remove my RSVP";
}

async function unattend() {
  const current = account;
  if (!current) return;
  const undo = $("rsvp-undo");
  if (!undoArmed) {
    undoArmed = true;
    undo.textContent = "Tap again to confirm";
    clearTimeout(undoTimer);
    undoTimer = setTimeout(disarmUndo, 4000);
    return;
  }
  disarmUndo();
  undo.disabled = true;
  setAttendingUi("attending");
  try {
    await current.deleteRecord(); // Deleted or already gone; verified below.
    if (current !== account) return;
    const existing = await current.getRecord();
    if (current !== account) return;
    if (checkedIn(existing)) throw new Error("Still on your account — try again in a moment.");
    undo.disabled = false;
    $("rsvp-yes").disabled = false;
    setAttendingUi("ready");
  } catch (error) {
    if (current !== account) return;
    undo.disabled = false;
    setAttendingUi("attending", `Couldn't remove your RSVP: ${errorMessage(error)}`);
  }
}

// Hosting is resolved from the account's DID document
async function resolvePds(did) {
  try {
    let doc;
    if (did?.startsWith("did:plc:")) {
      const response = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
      if (!response.ok) return null;
      doc = await response.json();
    } else if (did?.startsWith("did:web:")) {
      const [host, ...segments] = did.slice("did:web:".length).split(":").map(decodeURIComponent);
      const path = segments.join("/");
      const response = await fetch(`https://${host}/${path ? `${path}/did.json` : ".well-known/did.json"}`);
      if (!response.ok) return null;
      doc = await response.json();
    } else return null;
    const service = (doc.service || []).find((entry) => entry.id === "#atproto_pds" || entry.type === "AtprotoPersonalDataServer");
    return service?.serviceEndpoint?.replace(/\/$/, "") || null;
  } catch {
    return null;
  }
}

async function showHost(endpoint, did, handle) {
  const label = handle?.replace(/^@/, "") || "";
  const configuredAster = originOf(config.asterPdsHost);
  let host = null;
  try {
    host = new URL(endpoint).hostname;
  } catch {
    /* No endpoint: fall through to the neutral value. */
  }
  $("host-value").textContent = host || "couldn't check right now";

  const onAster =
    (configuredAster && originOf(endpoint) === configuredAster) || Boolean(config.asterHandleSuffix && label.endsWith(config.asterHandleSuffix));
  const note = $("host-note");
  const action = $("migration-link");
  const base =
    "Your handle is what you sign in with, and you can change it any time. Your DID is permanent, so your account survives a new handle or new host.";
  note.textContent = base;
  // An account already on Aster needs no explanation
  note.hidden = Boolean(onAster);
  action.hidden = Boolean(onAster);
}

async function welcome({ did, handle, getRecord, putRecord, deleteRecord, session }) {
  account = { did, getRecord, putRecord, deleteRecord, session };
  $("password").value = "";
  $("did-code").textContent = did;
  const recordLink = $("rsvp-record-link");
  if (recordLink) recordLink.href = `https://aturi.to/profile/${encodeURIComponent(did)}/${collection}/${config.rsvpRkey}`;
  fillIdentity(handle, did);
  disarmUndo();
  $("rsvp-yes").disabled = false;
  $("rsvp-undo").disabled = false;
  setAttendingUi("ready");
  $("host-value").textContent = "…";
  $("migration-link").hidden = false;
  show("joined");
  if (!$("conference-feed").src) $("conference-feed").src = $("conference-feed").dataset.src;
  if (!participantsLoaded) loadParticipants();
  loadAccount(did, handle);
  if (!eventReady()) {
    $("rsvp-yes").hidden = true;
    setAttendingUi("ready", "Attending opens closer to the event.");
    return;
  }
  $("rsvp-yes").hidden = false;
  try {
    const existing = await getRecord();
    if (account?.did === did) setAttendingUi(checkedIn(existing) ? "attending" : "ready");
  } catch {
    if (account?.did === did) setAttendingUi("ready", "Couldn't check your RSVP status — you can still confirm below.");
  }
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
    deleteRecord: () => agent.com.atproto.repo.deleteRecord({ repo: did, collection, rkey: config.rsvpRkey }),
  });
}

async function pdsRequest(path, token, body) {
  const response = await fetch(`${asterPds()}/xrpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
}

async function welcomePds(data) {
  const { did, handle, accessJwt } = data;
  return welcome({
    did,
    handle,
    async getRecord() {
      const params = new URLSearchParams({ repo: did, collection, rkey: config.rsvpRkey });
      const response = await fetch(`${asterPds()}/xrpc/com.atproto.repo.getRecord?${params}`);
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
    deleteRecord: () => pdsRequest("com.atproto.repo.deleteRecord", accessJwt, { repo: did, collection, rkey: config.rsvpRkey }),
  });
}

async function createAsterAccount() {
  const prefix = $("handle").value.trim().toLowerCase();
  const handle = `${prefix}${config.asterHandleSuffix}`;
  const response = await fetch(`${asterPds()}/xrpc/com.atproto.server.createAccount`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, inviteCode: config.asterInviteCode, password: $("password").value }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  if (!data.did || !data.accessJwt) throw new Error("Account created, but no session came back. Sign in with your new handle.");
  await welcomePds(data);
}

for (const button of document.querySelectorAll("[data-path]")) {
  button.addEventListener("click", () => {
    selectedPath = button.dataset.path;
    const aster = selectedPath === "aster";
    $("identity-title").textContent = aster ? "Sign up with Aster" : "Sign in";
    $("identity-explanation").textContent = aster
      ? "Creates an Aster account with the workshop's invite code, yours to keep afterwards."
      : "Use the account you got at IOSP check-in, or any other Atmosphere account.";
    const handleLabel = $("handle-label");
    if (handleLabel) handleLabel.hidden = !aster;
    $("handle").setAttribute("aria-label", aster ? "Choose a username" : "Your handle");
    $("handle").placeholder = aster ? "username" : "username.bsky.social";
    if (aster) $("handle").pattern = "[a-zA-Z0-9\\-]+";
    else $("handle").removeAttribute("pattern");
    $("handle").value = "";
    $("handle-suffix").textContent = config.asterHandleSuffix;
    $("handle-suffix").hidden = !aster;
    $("signup-fields").hidden = !aster;
    $("password").required = aster;
    $("continue-label").textContent = aster ? "Create account" : "Continue to sign in";
    $("form-status").hidden = true;
    show("identity");
  });
}

on("account-form", "submit", async (event) => {
  event.preventDefault();
  const button = $("continue");
  const status = $("form-status");
  const handle = $("handle").value.trim().replace(/^@/, "");
  if (selectedPath !== "aster" && !handle.includes(".")) {
    status.textContent = `Use your full handle, e.g. ${handle}.bsky.social`;
    status.hidden = false;
    return;
  }
  if (selectedPath === "aster" && (!config.asterPdsHost || !config.asterInviteCode)) {
    status.textContent = "Aster signup isn't configured yet — ask a volunteer at the desk.";
    status.hidden = false;
    return;
  }
  button.disabled = true;
  status.hidden = true;
  try {
    if (selectedPath === "aster") await createAsterAccount();
    else await startLogin(handle);
  } catch (error) {
    status.textContent = errorMessage(error);
    status.hidden = false;
  } finally {
    button.disabled = false;
  }
});

on("rsvp-yes", "click", markAttending);
on("rsvp-undo", "click", unattend);
for (const button of document.querySelectorAll("[data-go]")) button.addEventListener("click", () => show(button.dataset.go));
on("copy-did", "click", async () => {
  const button = $("copy-did");
  const did = $("did-code").textContent;
  if (!did || did === "…") return;
  if (!navigator.clipboard) {
    $("copy-did-tip").textContent = "Couldn't copy";
    return;
  }
  try {
    await navigator.clipboard.writeText(did);
  } catch {
    $("copy-did-tip").textContent = "Couldn't copy";
    setTimeout(() => {
      $("copy-did-tip").textContent = "Copy DID";
    }, 1600);
    return;
  }
  button.classList.add("is-copied");
  $("copy-status").textContent = "DID copied";
  setTimeout(() => {
    button.classList.remove("is-copied");
    $("copy-status").textContent = "";
  }, 1600);
});
on("sign-out", "click", async () => {
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

// One tab per station
const stationTabs = [...document.querySelectorAll(".station-tab")];
function selectStation(tab) {
  for (const other of stationTabs) {
    const selected = other === tab;
    other.setAttribute("aria-selected", String(selected));
    other.tabIndex = selected ? 0 : -1;
    $(other.getAttribute("aria-controls")).hidden = !selected;
  }
}
for (const tab of stationTabs) {
  tab.addEventListener("click", () => selectStation(tab));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : stationTabs.length - 1;
    const next = stationTabs[(stationTabs.indexOf(tab) + step) % stationTabs.length];
    next.focus();
    selectStation(next);
  });
}
selectStation(stationTabs[0]);

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
  link.hidden = true;
  $("participant-list").append(link);
}

function updateParticipantView() {
  const links = [...$("participant-list").children];
  const pageCount = Math.max(1, Math.ceil(links.length / participantPageSize));
  participantPage = Math.min(Math.max(participantPage, 0), pageCount - 1);
  const start = participantPage * participantPageSize;
  for (const [index, link] of links.entries()) link.hidden = index < start || index >= start + participantPageSize;
  const pager = $("pager-next");
  pager.disabled = participantsLoading;
  if (participantError) {
    pager.hidden = false;
    pager.setAttribute("aria-label", "Retry loading participants");
  } else {
    pager.hidden = pageCount <= 1 && !participantCursor;
    pager.setAttribute("aria-label", "Next page of participants");
  }
}

async function loadParticipants(all = false) {
  if (participantsLoading) return;
  participantsLoading = true;
  const status = $("participant-status");
  participantError = false;
  status.hidden = false;
  status.textContent = "Loading participants…";
  updateParticipantView();
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
    } while (all && participantCursor);
    participantsLoaded = true;
    if ($("participant-list").children.length) status.hidden = true;
    else status.textContent = "No participants yet.";
  } catch {
    participantError = true;
    status.textContent = "Could not load participants. Try again.";
  } finally {
    participantsLoading = false;
    updateParticipantView();
  }
}

on("pager-next", "click", async () => {
  if (participantError) {
    await loadParticipants();
    return;
  }
  if (participantCursor) await loadParticipants(true);
  const pageCount = Math.max(1, Math.ceil($("participant-list").children.length / participantPageSize));
  participantPage = (participantPage + 1) % pageCount;
  updateParticipantView();
});

window.addEventListener("message", (event) => {
  const iframe = $("conference-feed");
  if (event.source !== iframe.contentWindow || !["https://graze.social", "https://www.graze.social"].includes(event.origin)) return;
  if (!Array.isArray(event.data) || event.data[0] !== "setHeight" || event.data[1]?.id !== iframe.id) return;
  const height = Number(event.data[1].height);
  if (Number.isFinite(height) && height > 0) iframe.style.height = `${Math.min(Math.max(height, 420), 900)}px`;
});

const picker = $("app-picker");
on("open-feed", "click", () => picker?.showModal());
on("close-picker", "click", () => picker?.close());
picker?.addEventListener("click", (event) => {
  if (event.target === picker) picker.close();
});
for (const link of picker?.querySelectorAll("a") ?? []) link.addEventListener("click", () => picker.close());

try {
  const result = await restoreSession();
  if (result) await welcomeOAuth(result.session);
} catch (error) {
  $("form-status").textContent = `Could not restore sign-in: ${errorMessage(error)}`;
  $("form-status").hidden = false;
  show("identity");
}
