<script lang="ts">
  import BreathingLogo from "../components/BreathingLogo.svelte";
  import { goTo } from "../lib/stores/app.svelte.js";
  import { initProfiling } from "../lib/stores/profiling.svelte.js";

  async function startQuick() {
    await initProfiling("quick");
    goTo("profiling");
  }

  async function startFull() {
    await initProfiling("full");
    goTo("profiling");
  }
</script>

<div class="screen">
  <!-- Ambient glow -->
  <div class="ambient-glow"></div>

  <div class="content">
    <!-- Hero -->
    <div class="hero">
      <div class="logo-wrap animate-fade-up" style="--delay: 0ms">
        <BreathingLogo />
      </div>

      <h1 class="headline animate-fade-up" style="--delay: 200ms">
        Your AI doesn't<br />know you
      </h1>

      <p class="subline animate-fade-up" style="--delay: 350ms">
        Same person. Same question. Generic answer. Every time.
      </p>
    </div>

    <!-- Before / After -->
    <div class="comparison animate-fade-up" style="--delay: 500ms">
      <div class="comp-card comp-before">
        <span class="comp-label">Without profile</span>
        <div class="comp-bubble comp-ai">
          Here are some general productivity tips: 1) Use a task manager 2) Set priorities 3) Take breaks...
        </div>
        <span class="comp-verdict comp-verdict-bad">Generic. Useless.</span>
      </div>

      <div class="comp-card comp-after">
        <span class="comp-label">With meport</span>
        <div class="comp-bubble comp-ai comp-ai-good">
          Since you work in 90-min sprints and crash after lunch — block your deep work before 13:00. Skip the task list, just pick one thing.
        </div>
        <span class="comp-verdict comp-verdict-good">Knows you. Actually helps.</span>
      </div>
    </div>

    <!-- CTAs -->
    <div class="actions animate-fade-up" style="--delay: 700ms">
      <button class="btn-primary" onclick={startQuick}>
        <span class="btn-label">Quick start</span>
        <span class="btn-meta">60 seconds · 3 tiers</span>
      </button>

      <button class="btn-secondary" onclick={startFull}>
        <span class="btn-label">Deep profile</span>
        <span class="btn-meta">5 minutes · 9 tiers · 80+ dimensions</span>
      </button>
    </div>

    <!-- Trust signals -->
    <div class="trust animate-fade-up" style="--delay: 900ms">
      <span class="trust-item">
        <span class="trust-icon">◈</span> 100% private
      </span>
      <span class="trust-sep">·</span>
      <span class="trust-item">
        <span class="trust-icon">◈</span> No account
      </span>
      <span class="trust-sep">·</span>
      <span class="trust-item">
        <span class="trust-icon">◈</span> Open source
      </span>
    </div>
  </div>
</div>

<style>
  .screen {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .ambient-glow {
    position: absolute;
    top: -200px;
    left: 50%;
    transform: translateX(-50%);
    width: 800px;
    height: 600px;
    background: radial-gradient(
      ellipse at center,
      oklch(from #29ef82 l c h / 0.06) 0%,
      oklch(from #1ec9c9 l c h / 0.03) 40%,
      transparent 70%
    );
    pointer-events: none;
  }

  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    padding: 2rem;
    max-width: 560px;
    width: 100%;
  }

  /* Hero */
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .logo-wrap {
    margin-bottom: 1.5rem;
  }

  .headline {
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    font-weight: 600;
    color: oklch(from #ffffff l c h / 0.90);
    margin: 0;
    letter-spacing: -0.03em;
    line-height: 1.2;
  }

  .subline {
    font-size: 0.88rem;
    font-weight: 300;
    color: var(--color-text-secondary);
    margin: 0.75rem 0 0 0;
    line-height: 1.5;
  }

  /* Comparison */
  .comparison {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-top: 2.5rem;
    width: 100%;
  }

  .comp-card {
    padding: 1rem;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .comp-before {
    background: oklch(from #f87171 l c h / 0.03);
    border: 1px solid oklch(from #f87171 l c h / 0.08);
  }

  .comp-after {
    background: oklch(from #29ef82 l c h / 0.03);
    border: 1px solid oklch(from #29ef82 l c h / 0.08);
  }

  .comp-label {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
  }

  .comp-bubble {
    font-size: 0.72rem;
    line-height: 1.5;
    color: oklch(from #ffffff l c h / 0.45);
    padding: 0.65rem 0.85rem;
    border-radius: 10px;
    background: oklch(from #ffffff l c h / 0.03);
    border: 1px solid oklch(from #ffffff l c h / 0.04);
  }

  .comp-ai-good {
    color: oklch(from #ffffff l c h / 0.65);
  }

  .comp-verdict {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 500;
  }

  .comp-verdict-bad {
    color: oklch(from #f87171 l c h / 0.50);
  }

  .comp-verdict-good {
    color: oklch(from #29ef82 l c h / 0.60);
  }

  /* Actions */
  .actions {
    margin-top: 2rem;
    display: flex;
    gap: 0.75rem;
    width: 100%;
  }

  .btn-primary, .btn-secondary {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 1rem 1.25rem;
    border-radius: var(--radius-pill);
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: var(--color-accent);
    color: #080a09;
  }

  .btn-primary:hover {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 8px 32px oklch(from #29ef82 l c h / 0.20);
  }

  .btn-primary .btn-label {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .btn-primary .btn-meta {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    opacity: 0.6;
  }

  .btn-secondary {
    background: oklch(from #ffffff l c h / 0.04);
    border-color: var(--color-border);
    color: var(--color-text);
  }

  .btn-secondary:hover {
    border-color: var(--color-border-hover);
    background: oklch(from #ffffff l c h / 0.07);
    transform: translateY(-1px);
  }

  .btn-secondary .btn-label {
    font-weight: 500;
    font-size: 0.9rem;
  }

  .btn-secondary .btn-meta {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--color-text-muted);
  }

  .btn-primary:active, .btn-secondary:active {
    transform: translateY(0);
  }

  /* Trust */
  .trust {
    margin-top: 2.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.65rem;
    color: var(--color-text-ghost);
  }

  .trust-icon {
    color: oklch(from #29ef82 l c h / 0.25);
  }

  .trust-sep {
    opacity: 0.3;
  }

  /* Mobile */
  @media (max-width: 500px) {
    .comparison {
      grid-template-columns: 1fr;
    }

    .actions {
      flex-direction: column;
    }
  }
</style>
