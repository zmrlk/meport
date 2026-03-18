<script lang="ts">
  import { getProfile, goTo } from "../lib/stores/app.svelte.js";
  import { getDimensionWeight } from "@meport/core/types";
  import { t } from "../lib/i18n.svelte.js";
  import Icon from "../components/Icon.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";

  let profile = $derived(getProfile());

  let preferredName = $derived(
    profile ? String(profile.explicit["identity.preferred_name"]?.value ?? "Unknown") : "Unknown"
  );
  let archetype = $derived(profile?.synthesis?.archetype ?? null);
  let completeness = $derived(profile?.completeness ?? 0);
  let copySuccess = $state(false);
  let cardRef = $state<HTMLDivElement | null>(null);

  interface DimEntry { key: string; value: string; icon: string; weight: number }

  let topDimensions: DimEntry[] = $derived.by(() => {
    if (!profile) return [];
    const all: DimEntry[] = [];
    for (const [key, val] of Object.entries(profile.explicit)) {
      const v = Array.isArray(val.value) ? val.value.join(", ") : String(val.value);
      all.push({ key, value: v, icon: iconForDimension(key), weight: getDimensionWeight(key) });
    }
    for (const [key, val] of Object.entries(profile.inferred)) {
      all.push({ key, value: String(val.value), icon: iconForDimension(key), weight: getDimensionWeight(key) });
    }
    all.sort((a, b) => b.weight - a.weight);
    return all.slice(0, 8);
  });

  function iconForDimension(key: string): string {
    if (key.startsWith("identity")) return "user";
    if (key.startsWith("communication")) return "message";
    if (key.startsWith("cognitive")) return "brain";
    if (key.startsWith("work")) return "zap";
    if (key.startsWith("ai")) return "sparkle";
    if (key.startsWith("compound")) return "layers";
    if (key.startsWith("personality")) return "star";
    if (key.startsWith("neurodivergent")) return "activity";
    return "target";
  }

  function labelForKey(key: string): string {
    return key.split(".").pop()?.replace(/_/g, " ") ?? key;
  }

  function copyAsText() {
    if (!profile) return;
    const lines = [`meport — ${preferredName}`, archetype ? `Archetype: ${archetype}` : null, `Completeness: ${completeness}%`, "", "Top traits:"];
    for (const d of topDimensions) {
      lines.push(`  ${labelForKey(d.key)}: ${d.value}`);
    }
    const text = lines.filter(l => l !== null).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    });
  }

  async function downloadPng() {
    if (!cardRef) return;
    await document.fonts.ready;
    const canvas = document.createElement("canvas");
    const scale = 2;
    const w = 480;
    const h = 320 + topDimensions.length * 28;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);

    ctx.fillStyle = "#0c130d";
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();

    ctx.strokeStyle = "#29ef82";
    ctx.lineWidth = 1.5;
    ctx.roundRect(2, 2, w - 4, h - 4, 10);
    ctx.stroke();

    ctx.fillStyle = "#e8f5ea";
    ctx.font = "bold 28px Inter, sans-serif";
    ctx.fillText(preferredName, 28, 56);

    if (archetype) {
      ctx.fillStyle = "#29ef82";
      ctx.font = "500 14px Inter, sans-serif";
      ctx.fillText(archetype, 28, 82);
    }

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.roundRect(28, 100, w - 56, 6, 3);
    ctx.fill();
    ctx.fillStyle = "#29ef82";
    ctx.roundRect(28, 100, (w - 56) * (completeness / 100), 6, 3);
    ctx.fill();
    ctx.fillStyle = "#7aad7e";
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillText(`${completeness}% complete`, 28, 122);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(28, 136);
    ctx.lineTo(w - 28, 136);
    ctx.stroke();

    let y = 162;
    ctx.font = "13px Inter, sans-serif";
    for (const d of topDimensions) {
      ctx.fillStyle = "#7aad7e";
      ctx.fillText(labelForKey(d.key), 28, y);
      ctx.fillStyle = "#c8e6ca";
      ctx.fillText(d.value, 200, y);
      y += 28;
    }

    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillText("meport.dev", 28, h - 16);

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `meport-${preferredName.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  }
</script>

<div class="screen">
  {#if profile}
    <div class="header animate-fade-up" style="--delay: 0ms">
      <h1 class="header-title">{t("card.title")}</h1>
      <p class="header-desc">{t("card.desc")}</p>
    </div>

    <div class="card-wrap animate-fade-up" style="--delay: 150ms">
      <div class="card" bind:this={cardRef}>
        <div class="card-header">
          <div class="card-name-block">
            <h2 class="card-name">{preferredName}</h2>
            {#if archetype}
              <span class="card-archetype">{archetype}</span>
            {/if}
          </div>
          <div class="card-badge">meport</div>
        </div>

        <div class="card-completeness">
          <div class="completeness-bar">
            <div class="completeness-fill" style="width: {completeness}%"></div>
          </div>
          <span class="completeness-label">{completeness}% {t("card.complete")}</span>
        </div>

        <div class="card-divider"></div>

        <div class="card-dims">
          {#each topDimensions as dim}
            <div class="card-dim">
              <Icon name={dim.icon} size={12} />
              <span class="dim-key">{labelForKey(dim.key)}</span>
              <span class="dim-val">{dim.value}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <div class="actions animate-fade-up" style="--delay: 300ms">
      <button class="btn-secondary" onclick={copyAsText}>
        <Icon name={copySuccess ? "check" : "copy"} size={14} />
        {copySuccess ? t("copy.copied") : t("card.copy_text")}
      </button>
      <button class="btn-primary" onclick={downloadPng}>
        <Icon name="download" size={14} />
        {t("card.download_png")}
      </button>
    </div>
  {:else}
    <div class="empty-state">
      <Icon name="user" size={40} />
      <h1 class="empty-title">{t("card.no_profile")}</h1>
      <p class="empty-desc">{t("card.no_profile_desc")}</p>
      <button class="btn-primary" onclick={() => goTo("home")}>
        {t("card.go_home")}
      </button>
    </div>
  {/if}
</div>

<style>
  .screen {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow-y: auto;
    padding: var(--sp-8) var(--sp-6);
    gap: var(--sp-6);
  }

  .header {
    text-align: center;
  }

  .header-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .header-desc {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: var(--sp-1) 0 0 0;
  }

  .card-wrap {
    width: 100%;
    max-width: 480px;
  }

  .card {
    background: var(--color-bg-card);
    border: 1.5px solid var(--color-accent);
    border-radius: var(--radius-lg);
    padding: var(--sp-6);
    box-shadow: 0 0 32px oklch(from #29ef82 l c h / 0.08), 0 0 0 1px oklch(from #29ef82 l c h / 0.05) inset;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .card-name-block {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .card-name {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.03em;
  }

  .card-archetype {
    font-size: var(--text-sm);
    color: var(--color-accent);
    font-weight: 500;
  }

  .card-badge {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-ghost);
    padding: var(--sp-1) var(--sp-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xs);
  }

  .card-completeness {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .completeness-bar {
    flex: 1;
    height: 4px;
    background: oklch(from #ffffff l c h / 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  .completeness-fill {
    height: 100%;
    background: var(--color-accent);
    border-radius: 2px;
    transition: width 0.6s ease;
  }

  .completeness-label {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .card-divider {
    height: 1px;
    background: var(--color-border);
  }

  .card-dims {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .card-dim {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--color-accent);
  }

  .dim-key {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    min-width: 140px;
    text-transform: capitalize;
  }

  .dim-val {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: var(--sp-3);
  }
</style>
