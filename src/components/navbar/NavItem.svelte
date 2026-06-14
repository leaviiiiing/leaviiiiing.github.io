<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    class?: string;
    children?: Snippet;
  }

  const { class: className = "", children }: Props = $props();

  const mergedClass = $derived([className].filter(Boolean).join(" "));
</script>

<li
  class={`relative list-none pl-2.5 pr-2.5 text-align-center tracking-0.25 ${mergedClass}`.trim()}
>
  {#if children}
    {@render children()}
  {/if}
</li>
