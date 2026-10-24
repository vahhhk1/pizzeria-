/* Fiamma — page behaviour.
   All editable content (hours, address, email) lives in index.html;
   this file reads it from there so there's only one place to change. */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  /* ---------- Opening hours (parsed from the #hours table) ---------- */

  const toMinutes = (h, m) => Number(h) * 60 + Number(m);
  const fmt = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  // { 0: {open, close} | null, 1: ..., ... } keyed by Date#getDay()
  const hours = {};
  $$("#hours tr[data-day]").forEach((row) => {
    const match = row.querySelector("td").textContent.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
    hours[row.dataset.day] = match
      ? { open: toMinutes(match[1], match[2]), close: toMinutes(match[3], match[4]) }
      : null;
  });

  function renderOpenStatus() {
    const el = $("#open-status");
    if (!el) return;
    const text = $(".status__text", el);

    const now = new Date();
    const day = now.getDay();
    const mins = now.getHours() * 60 + now.getMinutes();
    const today = hours[day];

    $$("#hours tr").forEach((row) => row.classList.toggle("is-today", row.dataset.day === String(day)));

    el.classList.remove("is-open", "is-closed");

    if (today && mins >= today.open && mins < today.close) {
      el.classList.add("is-open");
      const left = today.close - mins;
      text.textContent = left <= 60
        ? `Open now · last call, closing at ${fmt(today.close)}`
        : `Open now · until ${fmt(today.close)}`;
      return;
    }

    el.classList.add("is-closed");

    if (today && mins < today.open) {
      text.textContent = `Closed · fire’s lit at ${fmt(today.open)} today`;
      return;
    }

    for (let i = 1; i <= 7; i++) {
      const next = hours[(day + i) % 7];
      if (next) {
        const when = i === 1 ? "tomorrow" : DAY_NAMES[(day + i) % 7];
        text.textContent = `Closed · opens ${when} at ${fmt(next.open)}`;
        return;
      }
    }
    text.textContent = "Closed";
  }

  renderOpenStatus();
  setInterval(renderOpenStatus, 60 * 1000);

  /* ---------- Nav ---------- */

  const nav = $(".nav");
  const toggle = $(".nav__toggle");
  const links = $("#nav-links");

  const setMenu = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    links.classList.toggle("is-open", open);
  };

  toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
  $$("a", links).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Menu tabs ---------- */

  const tabs = $$('[role="tab"]');
  const panels = $$('[role="tabpanel"]');

  function activate(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach((p) => {
      const on = p.id === tab.getAttribute("aria-controls");
      p.hidden = !on;
      p.classList.toggle("is-active", on);
    });
    if (focus) {
      tab.focus();
      tab.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => activate(tab, false));
    tab.addEventListener("keydown", (e) => {
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === "Home") next = tabs[0];
      if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); activate(next, true); }
    });
  });

  if (tabs.length) activate($('[role="tab"].is-active') || tabs[0], false);

  /* ---------- Directions link ---------- */

  const address = $("#address");
  const directions = $("#directions");
  if (address && directions) {
    directions.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address.textContent.trim());
  }

  /* ---------- Booking form (opens a pre-filled email; no backend needed) ---------- */

  const form = $("#booking");
  const msg = $("#booking-msg");

  if (form) {
    const dateInput = form.elements.date;
    const pad = (n) => String(n).padStart(2, "0");
    const t = new Date();
    dateInput.min = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;

    const say = (text, kind) => {
      msg.textContent = text;
      msg.className = "booking__msg" + (kind ? ` is-${kind}` : "");
    };

    form.addEventListener("input", (e) => {
      e.target.closest(".field")?.classList.remove("is-invalid");
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      say("");

      let firstBad = null;
      ["name", "date", "time"].forEach((name) => {
        const input = form.elements[name];
        const bad = !input.value.trim();
        input.closest(".field").classList.toggle("is-invalid", bad);
        if (bad && !firstBad) firstBad = input;
      });
      if (firstBad) {
        say("Please fill in your name, date and time.", "error");
        firstBad.focus();
        return;
      }

      const { name, date, time, guests, phone, notes } = form.elements;
      const chosen = new Date(`${date.value}T00:00`);
      const dayHours = hours[chosen.getDay()];
      const [h, m] = time.value.split(":");
      const slot = toMinutes(h, m);

      if (dateInput.min && date.value < dateInput.min) {
        date.closest(".field").classList.add("is-invalid");
        say("That date has already passed. Pick another one.", "error");
        return;
      }
      if (!dayHours) {
        date.closest(".field").classList.add("is-invalid");
        say(`We’re closed on ${DAY_NAMES[chosen.getDay()]}s. Try another day?`, "error");
        return;
      }
      if (slot < dayHours.open || slot >= dayHours.close) {
        time.closest(".field").classList.add("is-invalid");
        say(`On ${DAY_NAMES[chosen.getDay()]}s we’re open ${fmt(dayHours.open)}–${fmt(dayHours.close)}.`, "error");
        return;
      }

      const niceDate = chosen.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
      const subject = `Table request: ${name.value.trim()}, ${guests.value} guests, ${niceDate} ${time.value}`;
      const body = [
        `Name: ${name.value.trim()}`,
        `Date: ${niceDate}`,
        `Time: ${time.value}`,
        `Guests: ${guests.value}`,
        phone.value.trim() && `Phone: ${phone.value.trim()}`,
        notes.value.trim() && `Notes: ${notes.value.trim()}`,
      ].filter(Boolean).join("\n");

      window.location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      say("Your email app should open with the request ready to send. We’ll confirm by reply. Grazie!", "ok");
    });
  }

  /* ---------- Scroll reveal ---------- */

  const reveals = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- Footer year ---------- */

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
})();
