<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    class?: string;
    children?: Snippet;
  }

  const { class: className = "", children }: Props = $props();

  const mergedClass = $derived([className].filter(Boolean).join(" "));
</script>

<ul
  class={`inline-flex cursor-pointer items-center justify-center ${mergedClass}`.trim()}
>
  {#if children}
    {@render children()}
  {/if}
</ul>
