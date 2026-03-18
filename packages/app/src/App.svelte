<script lang="ts">
  import { getScreen, isTransitioning, goTo, hasProfile } from "./lib/stores/app.svelte.js";
  import { t } from "./lib/i18n.svelte.js";
  import "./styles/shared.css";
  import Icon from "./components/Icon.svelte";
  import sygnet from "./assets/sygnet.png";
  import HomeScreen from "./screens/HomeScreen.svelte";
  import ProfilingScreen from "./screens/ProfilingScreen.svelte";
  import RevealScreen from "./screens/RevealScreen.svelte";
  import ProfileScreen from "./screens/ProfileScreen.svelte";
  import ExportScreen from "./screens/ExportScreen.svelte";
  import SettingsScreen from "./screens/SettingsScreen.svelte";
  import CardScreen from "./screens/CardScreen.svelte";
  import ReportScreen from "./screens/ReportScreen.svelte";
  import DemoScreen from "./screens/DemoScreen.svelte";
  import HistoryScreen from "./screens/HistoryScreen.svelte";
  import FeedbackScreen from "./screens/FeedbackScreen.svelte";

  let screen = $derived(getScreen());
  let fading = $derived(isTransitioning());
  let profileExists = $derived(hasProfile());

  let showNav = $derived(screen !== "profiling" && screen !== "reveal");
</script>

<div class="shell">
  {#if showNav}
    <nav class="sidebar" aria-label="Main navigation">
      <button class="nav-logo" onclick={() => goTo("home")} aria-label="Home">
        <img src={sygnet} alt="meport" class="nav-logo-img" />
      </button>

      <div class="nav-items">
        <button
          class="nav-item"
          class:active={screen === "home"}
          onclick={() => goTo("home")}
          title="Home"
        >
          <Icon name="home" size={18} />
          <span class="nav-label">{t("nav.home")}</span>
        </button>

        <button
          class="nav-item"
          class:active={screen === "profile"}
          disabled={!profileExists}
          onclick={() => goTo("profile")}
          title={t("nav.profile")}
        >
          <Icon name="user" size={18} />
          <span class="nav-label">{t("nav.profile")}</span>
          {#if profileExists}
            <span class="nav-dot"></span>
          {/if}
        </button>

        <button
          class="nav-item"
          class:active={screen === "export"}
          onclick={() => goTo("export")}
          title="Export"
        >
          <Icon name="download" size={18} />
          <span class="nav-label">{t("nav.export")}</span>
        </button>

        <div class="nav-divider"></div>

        <button
          class="nav-item"
          class:active={screen === "card"}
          disabled={!profileExists}
          onclick={() => goTo("card")}
          title={t("nav.card")}
        >
          <Icon name="diamond" size={18} />
          <span class="nav-label">{t("nav.card")}</span>
        </button>

        <button
          class="nav-item"
          class:active={screen === "report"}
          disabled={!profileExists}
          onclick={() => goTo("report")}
          title={t("nav.report")}
        >
          <Icon name="sparkle" size={18} />
          <span class="nav-label">{t("nav.report")}</span>
        </button>

        <button
          class="nav-item"
          class:active={screen === "demo"}
          disabled={!profileExists}
          onclick={() => goTo("demo")}
          title={t("nav.demo")}
        >
          <Icon name="code" size={18} />
          <span class="nav-label">{t("nav.demo")}</span>
        </button>

        <button
          class="nav-item"
          class:active={screen === "history"}
          disabled={!profileExists}
          onclick={() => goTo("history")}
          title={t("nav.history")}
        >
          <Icon name="clock" size={18} />
          <span class="nav-label">{t("nav.history")}</span>
        </button>

        <button
          class="nav-item"
          class:active={screen === "feedback"}
          disabled={!profileExists}
          onclick={() => goTo("feedback")}
          title={t("nav.feedback")}
        >
          <Icon name="star" size={18} />
          <span class="nav-label">{t("nav.feedback")}</span>
        </button>
      </div>

      <button
        class="nav-item nav-bottom"
        class:active={screen === "settings"}
        onclick={() => goTo("settings")}
        title={t("nav.settings")}
      >
        <Icon name="settings" size={18} />
        <span class="nav-label">{t("nav.settings")}</span>
      </button>
    </nav>
  {/if}

  <main class="main" class:fading class:full-width={!showNav}>
    {#if screen === "home"}
      <HomeScreen />
    {:else if screen === "profiling"}
      <ProfilingScreen />
    {:else if screen === "reveal"}
      <RevealScreen />
    {:else if screen === "profile"}
      <ProfileScreen />
    {:else if screen === "export"}
      <ExportScreen />
    {:else if screen === "settings"}
      <SettingsScreen />
    {:else if screen === "card"}
      <CardScreen />
    {:else if screen === "report"}
      <ReportScreen />
    {:else if screen === "demo"}
      <DemoScreen />
    {:else if screen === "history"}
      <HistoryScreen />
    {:else if screen === "feedback"}
      <FeedbackScreen />
    {/if}
  </main>
</div>

<style>
  .shell {
    width: 100%;
    height: 100%;
    display: flex;
    overflow: hidden;
  }

  .sidebar {
    width: 72px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--sp-4) 0;
    border-right: 1px solid var(--color-border);
    background: oklch(from #060806 l c h / 0.98);
  }

  .nav-logo {
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    opacity: 0.85;
    transition: all 0.2s;
    filter: drop-shadow(0 0 6px oklch(from #29ef82 l c h / 0.15));
    flex-shrink: 0;
  }

  .nav-logo:hover {
    opacity: 1;
    filter: drop-shadow(0 0 10px oklch(from #29ef82 l c h / 0.25));
  }

  .nav-logo-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .nav-items {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-1);
  }

  .nav-divider {
    width: 32px;
    height: 1px;
    background: var(--color-border);
    margin: var(--sp-1) 0;
  }

  .nav-item {
    width: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: var(--sp-2) 0;
    border-radius: var(--radius-sm);
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
  }

  .nav-item:hover:not(:disabled) {
    color: var(--color-text-secondary);
    background: var(--color-bg-subtle);
  }

  .nav-item.active {
    color: var(--color-accent);
    background: var(--color-accent-bg);
  }

  .nav-item:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .nav-label {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.02em;
    line-height: 1;
  }

  .nav-dot {
    position: absolute;
    top: 6px;
    right: 8px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-accent);
    box-shadow: 0 0 6px oklch(from #29ef82 l c h / 0.40);
  }

  .nav-bottom {
    flex-shrink: 0;
  }

  .main {
    flex: 1;
    height: 100%;
    overflow: hidden;
    transition: opacity 0.25s ease-out;
  }

  .main.fading {
    opacity: 0;
  }

  .main.full-width {
    width: 100%;
  }

  @media (max-width: 768px) {
    .shell {
      flex-direction: column;
    }

    .sidebar {
      width: 100%;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      padding: var(--sp-2) 0;
      border-right: none;
      border-top: 1px solid var(--color-border);
      order: 1;
      flex-shrink: 0;
    }

    .nav-logo {
      display: none;
    }

    .nav-items {
      flex-direction: row;
      justify-content: center;
      flex: unset;
      gap: var(--sp-2);
    }

    .nav-item {
      width: auto;
      padding: var(--sp-2) var(--sp-3);
    }

    .nav-bottom {
      flex-shrink: 0;
    }

    .main {
      order: 0;
      flex: 1;
      height: 0; /* forces flex child to respect parent height */
    }
  }
</style>
