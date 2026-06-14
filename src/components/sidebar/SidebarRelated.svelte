<script lang="ts">
  import { currentLocale, getT } from "@/i18n";
  import type { RelatedPost } from "./SidebarTypes";

  interface Props {
    posts?: RelatedPost[];
    currentSlug?: string;
  }

  const { posts = [], currentSlug = "" }: Props = $props();
  const t = getT(currentLocale);
</script>

<div class="related text-[0.8125rem]">
  {#if posts.length > 0}
    <ul class="p-0 pr-[2px] pb-[5px] pl-5 text-left list-none m-0">
      {#each posts as post (post.slug)}
        <li
          class={`relative leading-[1.8] pb-2.5 ${post.slug === currentSlug ? "active" : ""}`}
        >
          <a
            href={`/posts/${post.slug}/`}
            title={post.title}
            class="text-ellipsis whitespace-nowrap overflow-hidden w-full inline-block text-inherit no-underline transition-colors duration-200"
          >
            {post.title}
          </a>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="text-grey-5 text-center text-sm">
      {t("sidebar.related.noContent")}
    </p>
  {/if}
</div>

<style>
  /* 保留伪元素及状态选择器，无法原子化 */
  .related ul li a:hover {
    color: var(--primary-color);
  }

  .related ul li.active a {
    color: var(--primary-color);
  }

  .related ul li::before {
    content: "";
    width: 0.5rem;
    height: 0.5rem;
    background: var(--primary-color);
    box-sizing: unset;
    left: -1.25rem;
    top: 0.3125rem;
    border-radius: 100%;
    position: absolute;
    border: 0.1875rem solid var(--grey-1);
    z-index: var(--z-content);
    transition: all 0.2s ease;
  }

  .related ul li:hover::before {
    background: var(--color-blue);
  }

  .related ul li:not(:last-child)::after {
    content: "";
    height: 100%;
    width: 0.125rem;
    background: var(--color-red-a3);
    position: absolute;
    left: -0.875rem;
    top: 0.5rem;
  }
</style>
