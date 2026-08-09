declare const __BRAND_PROFILE__: string;
declare const __TURNSTILE_SITE_KEY__: string;

interface Window {
  turnstile?: {
    render: (element: HTMLElement, options: Record<string, unknown>) => string;
  };
}
