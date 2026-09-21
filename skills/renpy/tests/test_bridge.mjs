import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(fileURLToPath(new URL("../assets/web/renpy-agent.js", import.meta.url)), "utf8");
function fixture({current = false, legacy = false, deny = false} = {}) {
  let now = 1000;
  let timerId = 0;
  const timers = new Map();
  const registered = [];
  const modelContext = {registerTool(tool) {
    if (deny) throw new Error("Permissions policy blocks tools");
    registered.push(tool);
  }};
  const window = {dispatchEvent() {}};
  const context = vm.createContext({window,
    document: {readyState: "loading", addEventListener() {}, ...(current ? {modelContext} : {})},
    navigator: legacy ? {modelContext} : {},
    CustomEvent: class {}, Date: {now: () => now},
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, {fn, at: now + delay}); return id; },
    clearTimeout: id => timers.delete(id), setInterval() {},
  });
  vm.runInContext(source, context);
  const state = (revision = 1, phase = "main_menu") => ({protocol: 1, ready: true, revision, phase,
    dialogue: phase === "dialogue" ? {speaker: "Ada", text: "Hello"} : null,
    choices: phase === "choice" ? [{id: "0", text: "Go", enabled: true}, {id: "1", text: "Wait", enabled: false}] : [],
    variables: {}, can: {start: phase === "main_menu", advance: phase === "dialogue", choose: phase === "choice"}});
  return {api: window.renpyAgent, registered, state,
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
  };
}

test("bridge is unavailable until the real engine publishes a heartbeat", async () => {
  const {api} = fixture();
  assert.equal((await api.getState()).ready, false);
  await assert.rejects(api.start({revision: 1}), {code: "NOT_READY"});
  assert.equal(api._next(), "null");
});

test("one action at a time, completion waits for engine state, and replayed replies are ignored", async () => {
  const {api, state} = fixture();
  api._publish(state());
  const result = api.start({revision: 1});
  await assert.rejects(api.start({revision: 1}), {code: "BUSY"});
  const command = JSON.parse(api._next());
  assert.deepEqual(command, {id: "1", action: "start", revision: 1});
  assert.equal(api._next(), "null");
  api._reply({id: "old", ok: false, error: "Ignore me"});
  api._reply({id: command.id, ok: true, revision: 1});
  assert.equal((await api.getState()).busy, true);
  api._publish(state(2, "dialogue"));
  const finished = await result;
  assert.equal(finished.changed, true);
  assert.equal(finished.state.phase, "dialogue");
  assert.equal(finished.state.busy, false);
});

test("requires exact revision and an enabled choice ID", async () => {
  const {api, state} = fixture();
  api._publish(state(5, "choice"));
  await assert.rejects(api.choose({revision: 4, choice_id: "0"}), {code: "STALE_REVISION"});
  await assert.rejects(api.choose({revision: 5, choice_id: "1"}), {code: "INVALID_CHOICE"});
  await assert.rejects(api.choose({revision: 5, choice_id: 0}), {code: "INVALID_CHOICE"});
  const action = api.choose({revision: 5, choice_id: "0", arbitrary: "ignored"});
  assert.deepEqual(JSON.parse(api._next()), {id: "1", action: "choose", revision: 5, choice_id: "0"});
  api._reply({id: "1", ok: false, error: "Stale revision", state: state(6, "dialogue")});
  await assert.rejects(action, {code: "ENGINE_REJECTED"});
  assert.equal((await api.getState()).revision, 6);
});

test("typewriter reveal can finish with an unchanged revision after an engine heartbeat", async () => {
  const {api, state, advance} = fixture();
  api._publish(state(3, "dialogue"));
  const action = api.advance({revision: 3});
  const command = JSON.parse(api._next());
  api._reply({id: command.id, ok: true});
  advance(500);
  api._publish(state(3, "dialogue"));
  assert.equal((await action).changed, false);
});

test("expired requests cannot execute later and stale heartbeats disable actions", async () => {
  const {api, state, advance} = fixture();
  api._publish(state());
  const action = api.start({revision: 1});
  const rejection = assert.rejects(action, {code: "TIMEOUT"});
  advance(12001);
  await rejection;
  assert.equal(api._next(), "null");
  const current = await api.getState();
  assert.equal(current.phase, "unresponsive");
  assert.equal(current.can.start, false);
});

test("cancellation removes undelivered action", async () => {
  const {api, state} = fixture();
  api._publish(state());
  const controller = new AbortController();
  const action = api.start({revision: 1}, {signal: controller.signal});
  controller.abort();
  await assert.rejects(action, {code: "ABORTED"});
  assert.equal(api._next(), "null");
});

test("registers the current document WebMCP API with constrained JSON schemas", async () => {
  const {api, registered, state} = fixture({current: true, legacy: true});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(registered.map(tool => tool.name), ["renpy_get_state", "renpy_start", "renpy_advance", "renpy_choose"]);
  assert.equal((await api.getState()).webmcp.interface, "document.modelContext");
  assert.equal(registered[3].inputSchema.additionalProperties, false);
  assert.deepEqual(Array.from(registered[3].inputSchema.required), ["revision", "choice_id"]);
  api._publish(state());
  assert.equal(JSON.parse(await registered[0].execute({})).phase, "main_menu");
});

test("supports the earlier navigator API and reports denied registrations truthfully", async () => {
  const legacy = fixture({legacy: true});
  const denied = fixture({current: true, deny: true});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await legacy.api.getState()).webmcp.interface, "navigator.modelContext");
  assert.equal((await legacy.api.getState()).webmcp.tools.length, 4);
  const status = (await denied.api.getState()).webmcp;
  assert.equal(status.tools.length, 0);
  assert.equal(status.errors.length, 4);
});
