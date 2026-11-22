import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

const routeBlock = app.match(/const SIDE_MENU_GROUPS = (\[[\s\S]*?\]);/);
assert.ok(routeBlock, "side menu route catalog exists");
const groups = JSON.parse(routeBlock[1]);
const routes = groups.flatMap(group => group.items);

test("preserves exactly three primary tabs", () => {
  assert.equal((html.match(/class="navtab(?: active)?"/g) || []).length, 3);
});

test("side drawer has open, close, scrim, and accessible state controls", () => {
  for (const id of ["drawerToggle", "drawerClose", "drawerScrim", "sideDrawer", "drawerNavigation"]) {
    assert.ok(html.includes('id="' + id + '"'), id + " is present");
  }
  assert.match(app, /aria-expanded/);
  assert.match(app, /drawer\.inert=false/);
  assert.match(app, /drawer\.inert=true/);
});

test("all sixteen feature screens have unique hash routes and icons", () => {
  assert.equal(routes.length, 16);
  assert.equal(new Set(routes.map(route => route.id)).size, 16);
  for (const route of routes) assert.ok(app.includes('"' + route.id + '":'), route.id + " icon exists");
  assert.ok(app.includes('href="#/\'+route.id'), "route href is built from its id");
});

test("hash router, back-to-primary action, and left-edge swipe are wired", () => {
  assert.ok(app.includes('window.addEventListener("hashchange",routeFromHash)'));
  assert.ok(app.includes('window.addEventListener("popstate",routeFromHash)'));
  assert.ok(app.includes('location.hash.match(/^#\\/([a-z0-9-]+)\\/?$/i)'));
  assert.ok(app.includes('delta>=72'));
  assert.ok(html.includes('id="routeHome"'));
});

test("drawer selection renders the route immediately and keeps the URL in sync", () => {
  assert.match(app, /function navigateSideRoute\(id\)\s*\{\s*if\(!routeItemById\(id\)\)return;[\s\S]*?history\.pushState\([\s\S]*?renderSideRoute\(id\);/);
  assert.match(app, /document\.addEventListener\("click",event=>\{\s*const target=event\.target instanceof Element\?event\.target:null;\s*const link=target\?\.closest\("#drawerNavigation \.drawer-link\[data-route\]"\);\s*if\(link\)navigateSideRoute\(link\.dataset\.route\);\s*\},true\)/);
});

test("a feature rendering error cannot leave the landing page covering the selected route", () => {
  const route = app.slice(app.indexOf("function renderSideRoute(routeId"), app.indexOf("function routeFromHash()"));
  assert.ok(route.indexOf('$("#landing").hidden=true') < route.indexOf("renderActiveFeatureRoute();"));
  assert.ok(route.includes('$("#routePlaceholder").hidden=false;'));
});

test("navigation listeners register before optional app initialization can fail", () => {
  assert.match(app, /function bindNavigationEvents\(\)/);
  const initialize = app.slice(app.indexOf("function initialize()"));
  assert.ok(initialize.indexOf("bindNavigationEvents();") < initialize.indexOf('step("analysis board",renderAll)'));
  assert.ok(initialize.includes('step("initial screen",'));
});

test("route screens reuse the existing theme and are visible only as the active screen", () => {
  assert.ok(html.includes('id="routeScreen"'));
  assert.ok(css.includes(".screen.active"));
  assert.ok(css.includes(".route-screen"));
});

