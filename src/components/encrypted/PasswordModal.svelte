<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { EncryptedData } from "@/toolkit/encryption/types";
  import { decryptContent, verifyPassword } from "@/toolkit/encryption/crypto";
  import { currentLocale, getT } from "@/i18n";

  interface Props {
    encryptedData: EncryptedData;
    title?: string;
    passwordPlaceholder?: string;
    submitText?: string;
    errorText?: string;
  }

  let {
    encryptedData,
    title = "",
    passwordPlaceholder,
    submitText,
    errorText,
  }: Props = $props();

  const t = getT(currentLocale);

  // 使用 i18n 默认值
  const _title = $derived(title || t("encrypted.title"));
  const _passwordPlaceholder = $derived(
    passwordPlaceholder || t("encrypted.passwordPlaceholder"),
  );
  const _submitText = $derived(submitText || t("encrypted.submit"));
  const _errorText = $derived(errorText || t("encrypted.error"));

  const dispatch = createEventDispatcher<{
    decrypted: string;
    error: string;
  }>();

  let password = $state("");
  let isLoading = $state(false);
  let error = $state("");
  let inputRef: HTMLInputElement | undefined = $state();

  async function handleSubmit(e: Event) {
    e.preventDefault();

    if (!password.trim()) {
      error = t("encrypted.passwordRequired");
      return;
    }

    isLoading = true;
    error = "";

    try {
      const isValid = await verifyPassword(encryptedData, password);
      if (isValid) {
        const content = await decryptContent(encryptedData, password);
        // 保存密码到 sessionStorage
        sessionStorage.setItem(
          `encrypted_${window.location.pathname}`,
          password,
        );
        dispatch("decrypted", content);
      } else {
        error = _errorText;
        password = "";
        inputRef?.focus();
      }
    } catch (err) {
      error = _errorText;
      password = "";
      inputRef?.focus();
    } finally {
      isLoading = false;
    }
  }

  function handleInput(e: Event) {
    password = (e.target as HTMLInputElement).value;
    if (error) error = "";
  }

  // 组件挂载时检查是否有缓存的密码
  // $effect(() => {
  //   const cachedPassword = sessionStorage.getItem(
  //     `encrypted_${window.location.pathname}`,
  //   );
  //   if (cachedPassword) {
  //     password = cachedPassword;
  //     handleSubmit(new Event("submit"));
  //   }
  // });
</script>

<div class="encrypted-post encrypted-lock-screen">
  <div class="encrypted-lock-icon">
    <i class="i-ri-lock-line"></i>
  </div>

  <h2 class="encrypted-title">{_title}</h2>

  <p class="encrypted-description">
    {t("encrypted.description")}
  </p>

  <form class="encrypted-password-form" onsubmit={handleSubmit}>
    <input
      bind:this={inputRef}
      type="password"
      class="encrypted-password-input"
      placeholder={_passwordPlaceholder}
      value={password}
      oninput={handleInput}
      disabled={isLoading}
      autocomplete="current-password"
    />

    <button
      type="submit"
      class="encrypted-submit-btn"
      disabled={isLoading || !password.trim()}
    >
      {#if isLoading}
        <span class="loading-spinner"></span>
        <span>{t("encrypted.decrypting")}</span>
      {:else}
        <i class="i-ri-lock-unlock-line"></i>
        <span>{_submitText}</span>
      {/if}
    </button>

    {#if error}
      <div class="encrypted-error">
        <i class="i-ri-error-warning-line icon"></i>
        <span>{error}</span>
      </div>
    {/if}
  </form>
</div>
