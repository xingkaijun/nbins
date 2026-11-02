import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { matchPath } from "react-router-dom";

import {
  INSPECTION_DETAIL_ROUTE,
  buildInspectionDetailHref,
  closeCurrentTab,
  inspectionDetailRoutePath,
  isBroadcastChannelSupported,
  openInspectionInNewTab,
  CURRENT_TAB_ID,
  publishInspectionUpdate,
  subscribeInspectionUpdates
} from "./inspection-sync.ts";

const INSPECTION_SYNC_CHANNEL = "nbins.inspections";

const routePattern = `/${INSPECTION_DETAIL_ROUTE}`;

const APP_SOURCE = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");
const PAGE_SOURCE = readFileSync(
  fileURLToPath(new URL("./pages/InspectionDetailPage.tsx", import.meta.url)),
  "utf8"
);

/**
 * Nesting-aware reader for the route tree in App.tsx. Every route is one line
 * (`<Route … />` or `<Route …>` … `</Route>`), so a small depth counter over the
 * `<Route` / `</Route>` lines gives the real parent/child structure.
 */
function routeLines(source) {
  const lines = source.split("\n");
  const depthAt = [];
  let depth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const isClose = trimmed === "</Route>";
    if (isClose) depth -= 1;
    depthAt.push(depth);
    // `<Route …>` opens a level; `<Route … />`, `<Routes>` and `</Routes>` do not.
    if (/^<Route[\s>]/.test(trimmed) && !trimmed.endsWith("/>")) depth += 1;
  }

  return {
    lines,
    depthAt,
    indexOf(predicate, label) {
      const index = lines.findIndex(predicate);
      assert.notEqual(index, -1, `${label} not found in App.tsx`);
      return index;
    }
  };
}

/** Runs `fn` with `globalThis.window` replaced by `fakeWindow`, then restores it. */
function withFakeWindow(fakeWindow, fn) {
  const previous = globalThis.window;
  globalThis.window = fakeWindow;
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previous;
    }
  }
}

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
  assert.equal(
    buildInspectionDetailHref("id with space", "/nbins/"),
    "/nbins/inspections/id%20with%20space",
    "base path and item encoding must not interfere"
  );
});

test("href defaults to '/' base when no Vite env is present", () => {
  assert.equal(buildInspectionDetailHref("abc"), "/inspections/abc");
});

test("detail route is a direct child of ProtectedRoute, not nested in the Layout route", () => {
  const tree = routeLines(APP_SOURCE);

  const protectedIndex = tree.indexOf(
    (line) => line.includes('element={<ProtectedRoute />}'),
    "ProtectedRoute route"
  );
  const layoutIndex = tree.indexOf((line) => line.includes('element={<Layout />}'), "Layout route");
  const detailIndex = tree.indexOf(
    (line) => line.includes("{INSPECTION_DETAIL_ROUTE}") && line.includes("InspectionDetailPage"),
    "inspection detail route"
  );
  const dashboardIndex = tree.indexOf((line) => line.includes('path="dashboard"'), "dashboard route");

  // Layout is nested one level below ProtectedRoute…
  assert.equal(tree.depthAt[protectedIndex], 0, "ProtectedRoute must be a top-level route");
  assert.equal(tree.depthAt[layoutIndex], 1, "Layout must be a child of ProtectedRoute");

  // …and the detail page is a *sibling* of Layout, still under ProtectedRoute.
  // Being at the Layout's own depth means it cannot be a descendant of Layout,
  // so it never renders the TopBar / global menu / bottom status bar.
  assert.equal(
    tree.depthAt[detailIndex],
    tree.depthAt[layoutIndex],
    "the detail route must not be nested inside the Layout route (it would get the TopBar)"
  );
  assert.equal(
    tree.depthAt[detailIndex],
    tree.depthAt[protectedIndex] + 1,
    "the detail route must stay under <ProtectedRoute> so the auth guard is unchanged"
  );
  assert.ok(
    detailIndex > protectedIndex,
    "the detail route must be declared inside the ProtectedRoute block, not next to /login"
  );

  // The rest of the app still renders inside the layout.
  assert.equal(
    tree.depthAt[dashboardIndex],
    tree.depthAt[layoutIndex] + 1,
    "app pages must still render inside the layout"
  );
});

test("standalone page drops the global shell but keeps the workspace", () => {
  // No TopBar / global navigation, no layout import, no in-page link that would
  // turn this tab into the workspace.
  assert.ok(!/from "\.\.\/components\/Layout"/.test(PAGE_SOURCE), "must not import Layout");
  assert.ok(!/<TopBar/.test(PAGE_SOURCE), "must not render TopBar");
  assert.ok(!/bottomStatusBar/.test(PAGE_SOURCE), "must not render the app status bar");
  assert.ok(!/\bLink\b/.test(PAGE_SOURCE), "must not use router <Link> navigation");
  assert.ok(!/to="\/dashboard"/.test(PAGE_SOURCE), "must not link to the dashboard workspace");

  // Reuses the real editing UI and the cross-tab broadcast.
  assert.ok(/InspectionWorkspace/.test(PAGE_SOURCE), "must reuse InspectionWorkspace");
  assert.ok(/publishInspectionUpdate/.test(PAGE_SOURCE), "must broadcast saves to the list tab");
  assert.ok(/closeCurrentTab/.test(PAGE_SOURCE), "close button must go through closeCurrentTab");
  assert.ok(/Close tab/.test(PAGE_SOURCE), "must offer an explicit Close tab button");
  assert.ok(
    /Browser|browsers/.test(PAGE_SOURCE) && /Ctrl\+W/.test(PAGE_SOURCE),
    "must explain that browsers may refuse to close the tab (manual fallback)"
  );
});

test("openInspectionInNewTab opens the real route in a new tab, drops opener and focuses", () => {
  const calls = [];
  const openedTab = {
    opener: "dashboard-window",
    focus() {
      calls.push(["focus"]);
    }
  };
  const openCalls = [];

  withFakeWindow(
    {
      open(url, target) {
        openCalls.push([url, target]);
        return openedTab;
      }
    },
    () => openInspectionInNewTab("insp-ship-A1-0")
  );

  assert.deepEqual(openCalls, [["/inspections/insp-ship-A1-0", "_blank"]]);
  assert.equal(openedTab.opener, null, "opener must be cleared (no reverse tabnabbing)");
  assert.deepEqual(calls, [["focus"]], "the new tab should be asked to focus");
});

test("openInspectionInNewTab tolerates a blocked popup (window.open returns null)", () => {
  withFakeWindow({ open: () => null }, () => {
    assert.doesNotThrow(() => openInspectionInNewTab("insp-1"));
  });
});

test("openInspectionInNewTab tolerates window.open and focus throwing", () => {
  withFakeWindow(
    {
      open() {
        throw new Error("popup blocked");
      }
    },
    () => {
      assert.doesNotThrow(() => openInspectionInNewTab("insp-1"), "window.open throwing must not break the click");
    }
  );

  const openedTab = {
    opener: "x",
    focus() {
      throw new Error("cannot focus");
    }
  };
  withFakeWindow({ open: () => openedTab }, () => {
    assert.doesNotThrow(() => openInspectionInNewTab("insp-1"), "focus throwing must not break the click");
  });
  assert.equal(openedTab.opener, null, "opener is cleared even when focus fails");
});

test("openInspectionInNewTab does nothing without a window (SSR / tests)", () => {
  const previous = globalThis.window;
  delete globalThis.window;
  try {
    assert.doesNotThrow(() => openInspectionInNewTab("insp-1"));
  } finally {
    if (previous !== undefined) globalThis.window = previous;
  }
});

test("closeCurrentTab clamps the browser refusal to a boolean", () => {
  let closed = 0;
  withFakeWindow({ close: () => { closed += 1; } }, () => {
    assert.equal(closeCurrentTab(), true);
  });
  assert.equal(closed, 1);

  withFakeWindow(
    {
      close() {
        throw new Error("Scripts may close only the windows that were opened by them");
      }
    },
    () => {
      assert.equal(closeCurrentTab(), false, "a refusing browser must not throw");
    }
  );

  withFakeWindow({}, () => {
    assert.equal(closeCurrentTab(), false, "missing window.close must not throw");
  });
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
  assert.equal(message.sourceTabId, CURRENT_TAB_ID);
});

test("ignoreOwnTab skips this tab's own updates but keeps updates from other tabs", async () => {
  const detail = { id: "insp-own", version: 1, workflowStatus: "open", comments: [] };
  const seen = [];
  const unsubscribe = subscribeInspectionUpdates((message) => seen.push(message.sourceTabId), { ignoreOwnTab: true });

  publishInspectionUpdate(detail);
  const other = new BroadcastChannel(INSPECTION_SYNC_CHANNEL);
  other.postMessage({ type: "inspection-updated", itemId: "insp-own", detail, sentAt: new Date().toISOString(), sourceTabId: "tab-other" });

  await new Promise((resolve) => setTimeout(resolve, 200));
  unsubscribe();
  other.close();
  assert.deepEqual(seen, ["tab-other"]);
});
