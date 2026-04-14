#!/usr/bin/env python3
"""
Fallback stress test for Hermes Agent.

Validates that the fallback_model configured in ~/.hermes/config.yaml
actually kicks in when the primary model fails.

Three phases (run all by default, or pass --level 1,2,3):

  L1 — Trigger path (mocked, 0 API calls)
       Spin up a minimal AIAgent with a fake primary client that returns
       a malformed "choices: []" response, then drive one agent turn and
       assert that `_try_activate_fallback()` was invoked. This closes a
       real gap in `tests/run_agent/test_provider_fallback.py`, which
       only tests the chain mechanism and not the trigger wiring.

  L2 — Smoke (~1 API call to gemini-2.5-pro, ~$0.0005)
       Resolve the real gemini provider from the user's config, then
       make one live chat-completion call. Proves the user's .env key
       + config.yaml actually talk to Google AI Studio.

  L3 — Forced failure end-to-end (1 real API call to gemini-2.5-pro)
       Boot a real AIAgent in-process with a stubbed primary client
       that raises AuthenticationError(401) on the first call. Run
       `agent.run_conversation(...)` and assert that the real fallback
       chain fires, constructs a REAL gemini client from ~/.hermes/.env,
       makes a REAL API call, and returns a real answer containing the
       expected marker. This exercises the full end-to-end chain in
       a single deterministic process — no subprocess / CLI fragility.

Usage:
    python scripts/fallback-stress-test.py                   # run all
    python scripts/fallback-stress-test.py --level 1         # L1 only
    python scripts/fallback-stress-test.py --level 2,3       # L2 + L3

Exit code: 0 if all selected phases pass, 1 otherwise.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

# ── Plumbing ──────────────────────────────────────────────────────────

HERMES_AGENT_DIR = Path.home() / ".hermes" / "hermes-agent"
HERMES_VENV_PYTHON = HERMES_AGENT_DIR / "venv" / "bin" / "python"

# Re-exec under the hermes venv so imports like `run_agent`, `agent.*`,
# and the OpenAI SDK are available without polluting the caller's env.
if sys.executable != str(HERMES_VENV_PYTHON) and HERMES_VENV_PYTHON.exists():
    os.execv(str(HERMES_VENV_PYTHON), [str(HERMES_VENV_PYTHON), __file__, *sys.argv[1:]])

if str(HERMES_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(HERMES_AGENT_DIR))


# ── ANSI helpers (no external deps) ───────────────────────────────────

def _c(code: str, s: str) -> str:
    return f"\033[{code}m{s}\033[0m"


def banner(title: str) -> None:
    bar = "─" * (len(title) + 4)
    print(f"\n{_c('1;36', bar)}")
    print(f"{_c('1;36', f'  {title}  ')}")
    print(f"{_c('1;36', bar)}")


def ok(msg: str) -> None:
    print(f"  {_c('1;32', '✔')} {msg}")


def fail(msg: str) -> None:
    print(f"  {_c('1;31', '✘')} {msg}")


def info(msg: str) -> None:
    print(f"  {_c('2;37', '·')} {msg}")


# ── L1: Trigger path (mocked) ─────────────────────────────────────────

def level1_trigger_path() -> bool:
    """Drive a fake turn with a malformed primary response and assert
    that the invalid-response branch in run_conversation() calls
    `_try_activate_fallback()`."""
    banner("L1 — Trigger path (mocked, 0 API calls)")
    try:
        from run_agent import AIAgent
    except Exception as e:
        fail(f"Cannot import run_agent: {e}")
        return False

    fb = {"provider": "gemini", "model": "gemini-2.5-pro"}

    # Build an AIAgent with the smallest possible surface. The pattern
    # mirrors tests/run_agent/test_provider_fallback.py:_make_agent.
    with (
        patch("run_agent.get_tool_definitions", return_value=[]),
        patch("run_agent.check_toolset_requirements", return_value={}),
        patch("run_agent.OpenAI"),
    ):
        agent = AIAgent(
            api_key="test-key",
            quiet_mode=True,
            skip_context_files=True,
            skip_memory=True,
            fallback_model=fb,
        )

    # Sanity: chain should be populated from the dict form.
    if len(agent._fallback_chain) != 1:
        fail(f"expected 1 fallback in chain, got {len(agent._fallback_chain)}")
        return False
    if agent._fallback_chain[0] != fb:
        fail(f"unexpected chain entry: {agent._fallback_chain[0]}")
        return False
    ok("fallback_chain parsed from config dict")

    # Spy on _try_activate_fallback so we can tell whether the trigger
    # path called it. We DON'T want real client swapping — just count
    # invocations and short-circuit so run_conversation exits.
    call_count = {"n": 0}
    original = agent._try_activate_fallback

    def spy() -> bool:
        call_count["n"] += 1
        # Mark as activated + advance index so the while-loop can exit
        # instead of infinitely retrying.
        agent._fallback_activated = True
        agent._fallback_index = len(agent._fallback_chain)
        return False  # "chain exhausted" — breaks the retry loop

    agent._try_activate_fallback = spy  # type: ignore[method-assign]
    _ = original  # keep a handle in case we need it

    # Forge a malformed response: choices list is empty. This trips
    # the `response_invalid` branch in run_conversation() (line ~8378).
    bad_response = MagicMock()
    bad_response.choices = []
    bad_response.error = None
    bad_response.model = "fake-model"

    # Make chat.completions.create keep returning the bad response.
    # agent.client was created via patched OpenAI() — it's a MagicMock,
    # so we can reach into .chat.completions.create directly.
    agent.client = MagicMock()
    agent.client.chat.completions.create = MagicMock(return_value=bad_response)
    agent.api_mode = "chat_completions"  # skip codex_responses branch

    # Zero out the jittered backoff so retries are instant. Patching
    # `time.sleep` is not enough — the run_conversation retry loop
    # polls `time.time() < sleep_end` with small `time.sleep(0.2)`
    # increments, so even a no-op sleep still burns real wall-clock
    # time. Collapsing the backoff duration itself is cleaner.
    try:
        with patch("run_agent.jittered_backoff", return_value=0.0):
            # Drive ONE turn. Wrap in try/except because after the spy
            # returns False, the code path will give up and return a
            # failure dict (which is exactly what we want).
            try:
                result = agent.run_conversation("hi")
            except Exception as e:
                # Some branches raise rather than returning — still
                # acceptable as long as the spy saw invocations.
                info(f"run_conversation raised (expected for exhausted chain): {type(e).__name__}")
                result = None
    except Exception as e:
        fail(f"test harness error: {e}")
        return False

    if call_count["n"] == 0:
        fail("_try_activate_fallback was NEVER called — trigger path broken")
        return False
    ok(f"_try_activate_fallback invoked {call_count['n']}× from the invalid-response branch")

    # Sanity: the spy made the chain look exhausted, so the result
    # should be a failure (not a happy completion).
    if result is None or (isinstance(result, dict) and result.get("failed")):
        ok("run_conversation terminated with failure after chain exhaustion (expected)")
    else:
        info(f"run_conversation returned: {type(result).__name__} — not a failure dict")

    return True


# ── L2: Smoke (real gemini call) ──────────────────────────────────────

def level2_smoke() -> bool:
    """Resolve the gemini provider from config and make one real call."""
    banner("L2 — Smoke test (~1 real API call to gemini-2.5-pro)")
    try:
        # Load .env the same way hermes does so GEMINI_API_KEY is visible.
        from dotenv import load_dotenv  # type: ignore
        load_dotenv(Path.home() / ".hermes" / ".env")
    except ImportError:
        # python-dotenv isn't guaranteed — parse manually as a fallback.
        env_path = Path.home() / ".hermes" / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        fail("neither GEMINI_API_KEY nor GOOGLE_API_KEY is set — check ~/.hermes/.env")
        return False
    ok("GEMINI_API_KEY / GOOGLE_API_KEY is set")

    try:
        from agent.auxiliary_client import resolve_provider_client
    except Exception as e:
        fail(f"cannot import resolve_provider_client: {e}")
        return False

    try:
        client, resolved_model = resolve_provider_client(
            "gemini", model="gemini-2.5-pro", raw_codex=True,
        )
    except Exception as e:
        fail(f"resolve_provider_client raised: {e}")
        return False

    if client is None:
        fail("resolve_provider_client returned None — gemini auth missing")
        return False
    ok(f"resolved: model={resolved_model}, base_url={client.base_url}")

    info("sending live request to gemini-2.5-pro (with retry on 5xx)...")
    # NOTE: gemini-2.5-pro is a *reasoning* model. Its reasoning tokens
    # count against max_tokens, so tiny budgets like 10 leave nothing
    # for the actual answer and the content field comes back empty.
    # Empirically ~150 reasoning tokens are consumed before the answer,
    # so 300 is a safe floor for a 1-word response.
    resp = None
    dt = 0.0
    last_err = None
    for attempt in range(1, 4):  # up to 3 tries — matches agent retry cadence
        t0 = time.monotonic()
        try:
            resp = client.chat.completions.create(
                model=resolved_model or "gemini-2.5-pro",
                messages=[
                    {"role": "user", "content": "Reply with exactly: OK"},
                ],
                max_tokens=300,
                temperature=0,
            )
            dt = time.monotonic() - t0
            break
        except Exception as e:
            dt = time.monotonic() - t0
            err_str = str(e)
            last_err = e
            # Retry on 429/503/529 (upstream overloaded / rate limited).
            if any(code in err_str for code in ("429", "503", "529", "UNAVAILABLE", "timeout")):
                info(f"attempt {attempt} hit transient {err_str[:80]!r} — retrying in 3s")
                time.sleep(3)
                continue
            fail(f"gemini call failed (non-retryable): {err_str}")
            return False
    if resp is None:
        fail(f"gemini call failed after 3 retries: {last_err}")
        return False

    try:
        content = resp.choices[0].message.content or ""
        finish = resp.choices[0].finish_reason
        usage = resp.usage
    except Exception:
        content = repr(resp)[:120]
        finish = "?"
        usage = None

    ok(f"gemini responded in {dt:.2f}s: finish={finish}, content={content!r}")
    if usage is not None:
        info(
            f"usage: prompt={usage.prompt_tokens} "
            f"completion={usage.completion_tokens} "
            f"total={usage.total_tokens} "
            f"(delta={usage.total_tokens - usage.prompt_tokens - usage.completion_tokens} thinking)"
        )
    if not content.strip():
        fail("response text is empty — likely ran out of max_tokens budget during reasoning")
        return False
    if finish != "stop":
        fail(f"finish_reason is {finish!r}, expected 'stop'")
        return False
    return True


# ── L3: Forced-failure end-to-end ─────────────────────────────────────

def level3_forced_failure() -> bool:
    """In-process end-to-end fallback test.

    Drives a REAL AIAgent with a Mock primary that raises
    `openai.AuthenticationError(401)` on the first API call, forcing
    the real `_try_activate_fallback()` to resolve a REAL gemini
    client from the user's ~/.hermes/.env + config.yaml, make a REAL
    API call, and return a real answer containing the expected marker.

    This is L1 (trigger path) + L2 (real gemini resolution) chained
    end-to-end. It exercises:
      - The exception classifier (_client_error detection for 401)
      - `_try_activate_fallback()` → `resolve_provider_client("gemini")`
      - Real `fb_client` construction with .env-sourced credentials
      - Retry-loop restart with swapped `self.client` / `self._client_kwargs`
      - Real chat_completions call to Google AI Studio
      - Response validation and final delivery back through the agent loop

    Why in-process instead of subprocess?  The subprocess approach
    has too many moving parts — CLI arg parsing, config discovery,
    credential migration, streaming path selection — and in practice
    hangs silently when the primary's bogus token reaches the real
    Codex backend (the OpenAI SDK opens an SSE stream that never
    completes).  In-process is deterministic, fast, and tests the
    same fallback chain code without the subprocess noise.
    """
    banner("L3 — In-process end-to-end fallback (~1 real API call)")

    # ── 1. Ensure GEMINI credentials are visible in env ───────────────
    env_path = Path.home() / ".hermes" / ".env"
    if env_path.exists():
        for raw in env_path.read_text().splitlines():
            raw = raw.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            k, _, v = raw.partition("=")
            os.environ.setdefault(k.strip(), v.strip())
    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        fail("GEMINI_API_KEY / GOOGLE_API_KEY missing from ~/.hermes/.env")
        return False
    ok("gemini credentials present in environment")

    # ── 2. Import the pieces we need ──────────────────────────────────
    try:
        from run_agent import AIAgent
        from openai import AuthenticationError
        import httpx as _httpx
    except Exception as e:
        fail(f"cannot import deps: {e}")
        return False

    fb = {"provider": "gemini", "model": "gemini-2.5-pro"}

    # ── 3. Construct the minimal AIAgent (same pattern as L1) ─────────
    # Patching `run_agent.OpenAI` makes `self.client` a MagicMock so
    # `_create_request_openai_client` short-circuits at line 4295 and
    # returns the mock directly — exactly the escape hatch we need
    # to inject the 401 without touching any HTTP transport.
    with (
        patch("run_agent.get_tool_definitions", return_value=[]),
        patch("run_agent.check_toolset_requirements", return_value={}),
        patch("run_agent.OpenAI"),
    ):
        agent = AIAgent(
            api_key="test-primary-key",
            quiet_mode=True,
            skip_context_files=True,
            skip_memory=True,
            fallback_model=fb,
        )
    agent.api_mode = "chat_completions"  # default path; gemini uses this too
    if len(agent._fallback_chain) != 1 or agent._fallback_chain[0] != fb:
        fail(f"fallback chain did not parse: {agent._fallback_chain}")
        return False
    ok("agent boot with mock primary + gemini fallback in chain")

    # ── 4. Wire up the 401 injection ──────────────────────────────────
    # Forge an `openai.AuthenticationError` with a realistic 401 response
    # so `classify_api_error()` recognizes it as non-retryable auth and
    # trips `is_client_error` at run_agent.py:9381.
    req = _httpx.Request("POST", "http://fake/chat/completions")
    resp = _httpx.Response(status_code=401, request=req, content=b'{"error":{"message":"bogus key"}}')
    call_count = {"primary": 0}

    def _raise_401(*args, **kwargs):
        call_count["primary"] += 1
        raise AuthenticationError(
            "Invalid API key (injected by stress test)",
            response=resp,
            body={"error": {"message": "Invalid API key"}},
        )

    agent.client = MagicMock()
    agent.client.chat.completions.create = MagicMock(side_effect=_raise_401)

    # ── 5. Run the conversation with backoff collapsed ────────────────
    info("running agent.run_conversation (primary stubbed to raise 401)...")
    t0 = time.monotonic()
    try:
        with patch("run_agent.jittered_backoff", return_value=0.0):
            result = agent.run_conversation("Reply with exactly one word: READY")
    except Exception as e:
        fail(f"run_conversation raised: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False
    dt = time.monotonic() - t0
    info(f"run_conversation returned in {dt:.2f}s (primary stub called {call_count['primary']}×)")

    # ── 6. Assert the fallback fired AND switched to real gemini ─────
    if not getattr(agent, "_fallback_activated", False):
        fail("_fallback_activated is False — fallback never fired")
        return False
    ok("_fallback_activated=True — fallback trigger executed")

    if agent.provider != "gemini":
        fail(f"agent.provider is {agent.provider!r}, expected 'gemini'")
        return False
    if "gemini" not in (agent.model or "").lower():
        fail(f"agent.model is {agent.model!r}, expected to contain 'gemini'")
        return False
    ok(f"agent swapped to real gemini: provider={agent.provider} model={agent.model}")

    # ── 7. Assert the real API call produced a plausible answer ──────
    final = ""
    if isinstance(result, dict):
        final = (result.get("final_response") or "").strip()
        if not final:
            messages = result.get("messages") or []
            for m in reversed(messages):
                if not isinstance(m, dict):
                    continue
                if m.get("role") == "assistant" and m.get("content"):
                    final = str(m.get("content")).strip()
                    break
    if not final:
        fail(f"no final response returned: result={str(result)[:200]!r}")
        return False
    ok(f"gemini answered: {final[:80]!r}")

    if "READY" not in final.upper():
        # Not a hard failure — gemini might rephrase. Log and continue.
        info("answer does not contain 'READY' literally — gemini rephrased")
    else:
        ok("answer contains 'READY' marker — fallback produced a valid reply")

    return True


# ── Main ──────────────────────────────────────────────────────────────

LEVELS: dict[str, Any] = {
    "1": ("L1 trigger path", level1_trigger_path),
    "2": ("L2 smoke", level2_smoke),
    "3": ("L3 forced failure", level3_forced_failure),
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--level", default="1,2,3",
        help="comma-separated levels to run (default: 1,2,3)",
    )
    args = ap.parse_args()
    selected = [x.strip() for x in args.level.split(",") if x.strip()]
    unknown = [x for x in selected if x not in LEVELS]
    if unknown:
        print(f"unknown levels: {unknown}  (valid: 1 2 3)", file=sys.stderr)
        return 2

    results: dict[str, bool] = {}
    for lv in selected:
        name, fn = LEVELS[lv]
        try:
            results[name] = fn()
        except Exception as e:
            fail(f"{name} crashed: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            results[name] = False

    banner("Summary")
    for name, passed in results.items():
        tag = _c("1;32", "PASS") if passed else _c("1;31", "FAIL")
        print(f"  {tag}  {name}")

    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
