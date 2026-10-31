import test from "node:test";
import assert from "node:assert/strict";
import { matchPath } from "react-router-dom";

import {
  INSPECTION_DETAIL_ROUTE,
  buildInspectionDetailHref,
  inspectionDetailRoutePath,
  isBroadcastChannelSupported,
  openInspectionInNewTab,
  publishInspectionUpdate,
  subscribeInspectionUpdates
} from "./inspection-sync.ts";

const routePattern = `/${INSPECTION_DETAIL_ROUTE}`;

test("detail route path matches the route registered in App.tsx", () => {
  const path = inspectionDetailRoutePath("insp-ship-A1-0");
  assert.equal(path, "/inspections/insp-ship-A1-0");

  const match = matchPath(routePattern, path);
  assert.ok(match, "route pattern should match the generated path");
  assert.equal(match.params.itemId, "insp-ship-A1-0");
});

test("ids with reserved URL characters survive the round trip", () => {
  const itemId = "insp/ship A1#0?x";
  const path = inspectionDetailRoutePath(itemId);
  assert.equal(path, "/inspections/insp%2Fship%20A1%230%3Fx");

  const match = matchPath(routePattern, path);
  assert.ok(match);
  assert.equal(decodeURIComponent(match.params.itemId), itemId);
});

test("href includes the deployment base path (router basename)", () => {
  assert.equal(buildInspectionDetailHref("insp-ship-A1-0", "/"), "/inspections/insp-ship-A1-0");
  assert.equal(buildInspectionDetailHref("insp-ship-A1-0", "/nbins/"), "/nbins/inspections/insp-ship-A1-0");
  assert.equal(buildInspectionDetailHref("insp-ship-A1-0", "/nbins"), "/nbins/inspections/insp-ship-A1-0");
});

test("href defaults to '/' base when no Vite env is present", () => {
  assert.equal(buildInspectionDetailHref("abc"), "/inspections/abc");
});

test("openInspectionInNewTab opens the real route in a new tab and drops window.opener", () => {
  const calls = [];
  const openedTab = { opener: "dashboard-window" };
  const previousWindow = globalThis.window;
  globalThis.window = {
    open(url, target) {
      calls.push([url, target]);
      return openedTab;
    }
  };

  try {
    openInspectionInNewTab("insp-ship-A1-0");
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }

  assert.deepEqual(calls, [["/inspections/insp-ship-A1-0", "_blank"]]);
  assert.equal(openedTab.opener, null);
});

test("saved detail is broadcast to subscribers in other contexts", async () => {
  assert.equal(isBroadcastChannelSupported(), true);

  const detail = {
    id: "insp-ship-A1-0",
    version: 3,
    workflowStatus: "open",
    resolvedResult: null,
    lastRoundResult: "QCC",
    currentRound: 2,
    comments: [{ id: "c1", status: "open" }]
  };

  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no broadcast received")), 2000);
    const unsubscribe = subscribeInspectionUpdates((message) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(message);
    });
  });

  publishInspectionUpdate(detail);
  const message = await received;

  assert.equal(message.type, "inspection-updated");
  assert.equal(message.itemId, "insp-ship-A1-0");
  assert.deepEqual(message.detail, detail);
});
