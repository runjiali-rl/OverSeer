/* OverSeer project page: lazy video loading, synced video groups, source switching. No dependencies. */
(function () {
  "use strict";

  // ---- lazy loading: a video gets its src when it comes near the viewport, plays while visible, pauses when not
  const lazy = document.querySelectorAll("video[data-src]");
  const load = (v) => {
    if (v.dataset.loaded) return;
    v.src = v.dataset.src;
    v.dataset.loaded = "1";
    v.load();
    if (v.dataset.rate) v.playbackRate = parseFloat(v.dataset.rate);   // the 8 fps sources play a little faster
  };
  const tryPlay = (v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
  if ("IntersectionObserver" in window) {
    const near = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { load(e.target); near.unobserve(e.target); } });
    }, { rootMargin: "600px 0px" });
    const visible = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) { load(v); if (!v.dataset.paused) tryPlay(v); }
        else if (!v.paused) v.pause();
      });
    }, { threshold: 0.05 });
    lazy.forEach((v) => { near.observe(v); visible.observe(v); });
  } else {
    lazy.forEach((v) => { load(v); tryPlay(v); });
  }

  // ---- copy the BibTeX
  document.querySelectorAll("button[data-copy]").forEach((btn) => {
    const src = document.getElementById(btn.dataset.copy);
    if (!src) return;
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(src.textContent.trim());
        const was = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => { btn.textContent = was; }, 1400);
      } catch (e) { /* clipboard blocked: leave the text selectable */ }
    });
  });

  // ---- the top bar marks the section in view
  const navLinks = Array.from(document.querySelectorAll(".nav-links a"));
  const targets = navLinks.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  const topbar = document.querySelector(".topbar");
  if (targets.length && topbar) {
    let pending = false;
    const mark = () => {
      pending = false;
      const height = topbar.getBoundingClientRect().height;
      document.documentElement.style.setProperty("--topbar-offset", `${height}px`);
      // Keep the current chapter selected through long sections and the gaps between them.
      const current = targets.filter((t) => t.getBoundingClientRect().top <= height + 24).pop();
      navLinks.forEach((a) => {
        const active = !!current && a.getAttribute("href") === "#" + current.id;
        a.classList.toggle("active", active);
        if (active) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
    };
    const scheduleMark = () => {
      if (!pending) { pending = true; requestAnimationFrame(mark); }
    };
    window.addEventListener("scroll", scheduleMark, { passive: true });
    window.addEventListener("resize", scheduleMark);
    window.addEventListener("load", scheduleMark);
    if ("ResizeObserver" in window) new ResizeObserver(scheduleMark).observe(topbar);
    mark();
  }

  // ---- "More samples": a button reveals a hidden grid of further episodes; the lazy loader picks the videos up
  document.querySelectorAll("button[data-more]").forEach((btn) => {
    const box = document.getElementById(btn.dataset.more);
    if (!box) return;
    const label = btn.dataset.label || btn.textContent;
    btn.addEventListener("click", () => {
      const open = box.hasAttribute("hidden");
      box.toggleAttribute("hidden", !open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? (btn.dataset.openLabel || label.replace(/^Show \d+ more/, "Show fewer")) : label;
      if (open) box.querySelectorAll("video[data-src]").forEach((v) => { load(v); tryPlay(v); });
      else box.querySelectorAll("video").forEach((v) => v.pause());
    });
  });

  // ---- synced groups: every video with the same data-group is restarted / paused / sped up together
  const groups = {};
  document.querySelectorAll("video[data-group]").forEach((v) => {
    (groups[v.dataset.group] = groups[v.dataset.group] || []).push(v);
  });
  const each = (name, f) => (groups[name] || []).forEach(f);
  const speedLabel = (name) => {
    const el = document.querySelector(`[data-speed-for="${name}"]`);
    const v = (groups[name] || [])[0];
    if (el && v) el.textContent = `Speed ×${v.playbackRate.toFixed(2)}`;
  };
  const restart = (name) => each(name, (v) => { v.currentTime = 0; if (!v.dataset.paused) tryPlay(v); });

  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.group, act = btn.dataset.action;
      if (act === "restart") restart(name);
      if (act === "toggle") each(name, (v) => {
        if (v.paused) { delete v.dataset.paused; tryPlay(v); } else { v.dataset.paused = "1"; v.pause(); }
      });
      if (act === "slower") each(name, (v) => { v.playbackRate = Math.max(0.25, v.playbackRate / 2); });
      if (act === "faster") each(name, (v) => { v.playbackRate = Math.min(4, v.playbackRate * 2); });
      if (act === "normal") each(name, (v) => { v.playbackRate = 1; });
      speedLabel(name);
    });
  });

  // keep a group in step: when the first video loops back, the others follow (the clips have equal length)
  Object.keys(groups).forEach((name) => {
    const vs = groups[name];
    if (vs.length < 2) return;
    let last = 0;
    vs[0].addEventListener("timeupdate", () => {
      const t = vs[0].currentTime;
      if (t < last - 0.5) vs.slice(1).forEach((v) => { v.currentTime = 0; });   // looped
      else vs.slice(1).forEach((v) => { if (Math.abs(v.currentTime - t) > 0.25) v.currentTime = t; });
      last = t;
    });
  });

  // ---- OverSeer's auxiliary views: a panel per group, offered only when the selected example has them
  function auxFollow(name, opt) {
    const btn = document.querySelector(`button[data-aux-for="${name}"]`);
    if (!btn) return;
    const box = document.getElementById(btn.dataset.more);
    const has = !!opt.dataset.aux;
    if (!has && box && !box.hasAttribute("hidden")) btn.click();   // close it when switching to a task without them
    btn.disabled = !has;                                            // stays visible, says where the views exist
    const open = box && !box.hasAttribute("hidden");
    btn.textContent = has ? (open ? btn.dataset.openLabel : btn.dataset.label) : btn.dataset.offLabel;
  }

  // ---- source switching: a <select data-switch="group"> whose options carry data-<slot>="path" for every
  //      video[data-slot] of the group; a caption element [data-caption-for="group"] shows the option's data-caption
  document.querySelectorAll("select[data-switch]").forEach((sel) => {
    const name = sel.dataset.switch;
    const apply = () => {
      const opt = sel.options[sel.selectedIndex];
      each(name, (v) => {
        const slot = v.dataset.slot;
        const src = opt.dataset[slot];
        if (!src) return;
        const poster = opt.dataset[slot + "Poster"];
        if (poster) v.poster = poster;
        v.dataset.src = src;
        v.src = src;
        v.dataset.loaded = "1";
        v.load();
        if (v.dataset.rate) v.playbackRate = parseFloat(v.dataset.rate);
        if (!v.dataset.paused) tryPlay(v);
      });
      const cap = document.querySelector(`[data-caption-for="${name}"]`);
      if (cap && opt.dataset.caption !== undefined) cap.innerHTML = opt.dataset.caption;
      auxFollow(name, opt);
    };
    auxFollow(name, sel.options[sel.selectedIndex]);
    sel.addEventListener("change", apply);
  });
})();
