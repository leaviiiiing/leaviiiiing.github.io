<script lang="ts">
  import NavItem from "./NavItem.svelte";

  interface Props {
    href?: string;
    text?: string;
    icon?: string | null;
    ariaLabel?: string;
    class?: string;
  }

  const {
    href = "#",
    text,
    icon = null,
    ariaLabel,
    class: className = "",
  }: Props = $props();

  const iconClasses = $derived(
    icon ? `${icon} icon-nav text-xl vertical-text-bottom inline-block` : "",
  );
  const mergedClass = $derived([className].filter(Boolean).join(" "));
</script>

<NavItem class={mergedClass}>
  <a {href} aria-label={ariaLabel}>
    {#if icon}
      <div class={iconClasses}></div>
    {/if}
    {text}
  </a>
</NavItem>
