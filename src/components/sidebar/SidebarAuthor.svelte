<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    author?: string;
    description?: string;
    avatarImage?: Snippet;
  }

  const { author = "", description = "", avatarImage }: Props = $props();
</script>

{#if author || avatarImage}
  <div class="author" itemscope itemtype="http://schema.org/Person">
    {#if avatarImage}
      <div
        class="image border border-body-bg-shadow block mx-auto max-w-40 p-0.5 shadow-[0_0_1rem_0.625rem_var(--body-bg-shadow)] rounded-full transition-transform duration-300 overflow-hidden"
        itemprop="image"
      >
        {@render avatarImage()}
      </div>
    {/if}
    {#if author}
      <p
        class="text-grey-7 font-normal m-0 mt-[5px] text-center"
        itemprop="name"
      >
        {author}
      </p>
    {/if}
    {#if description}
      <div
        class="text-grey-5 text-sm mt-[5px] text-center"
        itemprop="description"
      >
        {description}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* 保留用于 hover 抖动动画 */
  .author .image :global(img) {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 50%;
  }

  .author:hover .image {
    animation: shake 0.82s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  }

  @keyframes shake {
    0% {
      transform: scale(1);
    }
    10%,
    20% {
      transform: scale(0.9) rotate(3deg);
    }
    30%,
    50%,
    70%,
    90% {
      transform: scale(1.1) rotate(-3deg);
    }
    40%,
    60%,
    80% {
      transform: scale(1.1) rotate(3deg);
    }
    100% {
      transform: scale(1);
    }
  }
</style>
