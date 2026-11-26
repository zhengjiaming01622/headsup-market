/**
 * even-bridge.js — minimal Even Hub bridge adapter (zero dependencies).
 *
 * How Even Hub works (per official docs at hub.evenrealities.com):
 *  - The app is a normal web app; the Even App (phone) hosts it in a WebView
 *    and injects a bridge. The glasses are a display + input peripheral.
 *  - The production path bundles the npm SDK `@evenrealities/even_hub_sdk`
 *    and awaits `waitForEvenAppBridge()` before any other call.
 *  - UI on the glasses is NOT DOM/CSS: you declare containers
 *    (text / list / image) in absolute pixels on a 576x288 canvas and the
 *    firmware renders them. Text containers are plain text only.
 *  - Input arrives via `bridge.onEvenHubEvent(...)`; event types:
 *      0 CLICK_EVENT · 1 SCROLL_TOP_EVENT · 2 SCROLL_BOTTOM_EVENT
 *      3 DOUBLE_CLICK_EVENT · 9/10 long press start/release
 *    (the SDK may normalize CLICK 0 to `undefined`.)
 *  - Root-page exit contract: double-tap calls
 *    `bridge.shutDownPageContainer(1)`.
 *
 * This file keeps the hackathon prototype dependency-free: if an injected
 * bridge is present (real glasses / simulator with the SDK bundle) it drives
 * one full-screen text container; otherwise it runs in browser-preview mode
 * and app.js renders the DOM canvas instead. Swapping this adapter for the
 * official SDK bundle is a drop-in change (see README "Production build").
 */
(function () {
  'use strict';

  var EVENT = { CLICK: 0, SCROLL_TOP: 1, SCROLL_BOTTOM: 2, DOUBLE_CLICK: 3 };

  function detectBridge() {
    try {
      if (window.EvenAppBridge && typeof window.EvenAppBridge.getInstance === 'function') {
        return window.EvenAppBridge.getInstance();
      }
      if (window.evenAppBridge) return window.evenAppBridge;
    } catch (e) { /* ignore */ }
    return null;
  }

  /**
   * @param {function(string)} onAction - 'next' | 'prev' | 'select' | 'exit'
   * @param {function(string)} log
   * @returns {{mode: string, pushText: function(string), exit: function()}}
   */
  function init(onAction, log) {
    var bridge = detectBridge();
    if (!bridge) {
      log('bridge: not detected → browser preview mode');
      return {
        mode: 'browser',
        pushText: function () {},
        exit: function () { log('exit requested (browser mode: no-op)'); }
      };
    }

    log('bridge: EvenAppBridge detected → glasses mode');
    var started = false;

    function handleEvent(event) {
      if (!event) return;
      var src = event.textEvent || event.sysEvent || event.listEvent;
      if (!src) return;
      var t = src.eventType;
      if (t === EVENT.CLICK || t === undefined) onAction('select');
      else if (t === EVENT.SCROLL_TOP) onAction('prev');
      else if (t === EVENT.SCROLL_BOTTOM) onAction('next');
      else if (t === EVENT.DOUBLE_CLICK) onAction('exit');
    }

    return {
      mode: 'glasses',
      pushText: function (text) {
        // Text container: full-canvas, plain text, event-capturing.
        var payload = {
          containerID: 1, containerName: 'main',
          content: String(text).slice(0, 2000)
        };
        try {
          if (!started && typeof bridge.createStartUpPageContainer === 'function') {
            started = true;
            bridge.createStartUpPageContainer({
              containerTotalNum: 1,
              textObject: [{
                xPosition: 0, yPosition: 0, width: 576, height: 288,
                containerID: 1, containerName: 'main', isEventCapture: 1,
                content: payload.content
              }]
            });
            if (typeof bridge.onEvenHubEvent === 'function') {
              bridge.onEvenHubEvent(handleEvent);
            }
          } else if (typeof bridge.textContainerUpgrade === 'function') {
            bridge.textContainerUpgrade(payload);
          }
        } catch (e) { log('bridge push failed: ' + e.message); }
      },
      exit: function () {
        try {
          if (typeof bridge.shutDownPageContainer === 'function') {
            bridge.shutDownPageContainer(1);
          }
        } catch (e) { log('bridge exit failed: ' + e.message); }
      }
    };
  }

  window.HeadsUpBridge = { init: init, EVENT: EVENT };
})();
