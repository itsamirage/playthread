export function goBackOrFallback(router, fallbackHref = "/(tabs)") {
  if (router?.canGoBack?.()) {
    router.back();
    return;
  }

  router?.replace?.(fallbackHref);
}
