// UI/data alignment for the revised Mon Aug 17 route.
// Loaded before app.js. The operational route lives in aug17-live-override.js;
// this file removes a few stale Aug 19 / Magnetic Hill labels that are still
// hard-coded in the older dashboard renderer.
(function () {
  'use strict';

  // Move the catalogue version of Hopewell to the day it is now actually used.
  var tripDataNode = document.getElementById('trip-data');
  if (tripDataNode) {
    try {
      var raw = JSON.parse(tripDataNode.textContent);
      (raw.attractions || []).forEach(function (item) {
        if (/hopewell rocks/i.test(String(item.Attraction || ''))) {
          item.Day = 'Aug 17';
          item['Best time'] = 'Low tide 10:20 AM ADT · target parking 09:35–09:45; follow park staff for actual ocean-floor access.';
        }
      });
      (raw.sources || []).forEach(function (item) {
        if (/hopewell/i.test(String(item.Topic || ''))) {
          item['Key fact used'] = 'CHS predicts low tide at 10:20 AM ADT on Aug 17 (1.075 m). Actual ocean-floor access remains at park staff discretion.';
        }
      });
      tripDataNode.textContent = JSON.stringify(raw);
    } catch (error) {
      // Keep the original embedded trip data if an older saved copy has a
      // different shape. The operational Aug 17 override still remains valid.
    }
  }

  function activeLiveDay() {
    var field = document.getElementById('liveDay');
    return field && field.value;
  }

  function activePlanDay() {
    var field = document.getElementById('daySelectV2');
    return field && field.value;
  }

  function patchLive() {
    if (activeLiveDay() !== '2026-08-17') return;

    var heroTarget = document.querySelector('#live .next-stop p.small');
    if (heroTarget && /Hotel arrival target:/i.test(heroTarget.textContent || '')) {
      heroTarget.innerHTML = '<strong>Hotel arrival target:</strong> 17:45–18:15 target';
    }

    var tide = Array.from(document.querySelectorAll('#live .mode-note.safe')).find(function (node) {
      return /Hopewell:/i.test(node.textContent || '');
    });
    if (tide && !tide.dataset.aug17TideFixed) {
      tide.dataset.aug17TideFixed = '1';
      tide.innerHTML = '<strong>Hopewell:</strong> Low tide 10:20 AM ADT. Target parking 09:35–09:45 and the ocean-floor access area before low tide; park staff control the actual safe window.'
        + '<div class="action-bar">'
        + '<a class="button subtle" href="https://www.parcsnbparks.info/en/parks/33/hopewell-rocks-provincial-park" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Hopewell park info ↗</a>'
        + '<a class="button subtle" href="https://www.tides.gc.ca/en/stations/00170" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">CHS tide ↗</a>'
        + '</div>';
    }

    var freshness = document.querySelector('#live .freshness-card .small');
    if (freshness && /Magnetic Hill|Hopewell tide\/access/i.test(freshness.textContent || '')) {
      freshness.textContent = 'Check Hopewell access/tide, Fundy conditions, Cape Jourimain hours and Confederation Bridge conditions before leaving Fredericton.';
    }
  }

  function patchPlan() {
    if (activePlanDay() !== '2026-08-17') return;
    var anchor = document.querySelector('#dayResult .hotel-anchor');
    if (!anchor) return;
    var sleepSmall = anchor.querySelectorAll('.hotel-anchor-item small')[1];
    if (sleepSmall) sleepSmall.textContent = 'Check-in from 16:00 · target 17:45–18:15';
    var rule = anchor.querySelector('.hotel-rule');
    if (rule) rule.innerHTML = '<strong>Hotel rule:</strong> Arrive after Cape Jourimain, check in, unload, and make the evening intentionally easy.';
  }

  function patchChecklist() {
    Array.from(document.querySelectorAll('#checklist .checklist-row')).forEach(function (row) {
      var heading = row.querySelector('h3');
      if (!heading) return;
      if (/Re-verify Hopewell access and Sackville hours/i.test(heading.textContent || '')) {
        heading.textContent = 'Re-check Hopewell, Fundy and Cape conditions before Aug 17';
        var body = row.querySelector('p:not(.task-meta)');
        if (body) body.textContent = 'Hopewell low tide is 10:20 AM ADT on Aug 17; confirm ocean-floor access, Fundy advisories and Cape Jourimain conditions before departure.';
      }
      if (/Confirm the Aug 17 Magnetic Hill operating clock/i.test(heading.textContent || '')) {
        heading.textContent = 'Confirm Aug 17 Fundy / Cape conditions';
        var detail = row.querySelector('p:not(.task-meta)');
        if (detail) detail.textContent = 'Magnetic Hill is no longer in the Aug 17 route. Protect Hopewell, Herring Cove, Alma lobster and Cape Jourimain instead.';
      }
    });
  }

  function patchAll() {
    patchLive();
    patchPlan();
    patchChecklist();
  }

  function install() {
    patchAll();
    var root = document.getElementById('main-content') || document.body;
    if (!root || typeof MutationObserver === 'undefined') return;
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        patchAll();
      });
    }).observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}());
