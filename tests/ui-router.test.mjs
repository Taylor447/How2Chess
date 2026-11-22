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
  assert.ok(app.includes("history.pushState({h2cRoute:id}"));
  assert.ok(app.includes("renderSideRoute(id);"));
  assert.ok(app.includes('document.addEventListener("click",event=>{'));
  assert.ok(app.includes('target?.closest("#drawerNavigation .drawer-link[data-route]")'));
  assert.ok(app.includes('if(link)navigateSideRoute(link.dataset.route);'));
  assert.ok(app.includes("},true);"));
});

test("route screens reuse the existing theme and are visible only as the active screen", () => {
  assert.ok(html.includes('id="routeScreen"'));
  assert.ok(css.includes(".screen.active"));
  assert.ok(css.includes(".route-screen"));
});
