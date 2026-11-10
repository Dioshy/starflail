/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** 'mock' (dev default) | 'web' | 'crazygames' | 'poki' | 'itch' */
  readonly VITE_PLATFORM?: string;
  /** itch build: URL of the game's itch.io page */
  readonly VITE_ITCH_URL?: string;
  readonly VITE_STRIPE_LINK_SUPPORTER_PACK?: string;
  readonly VITE_STRIPE_LINK_BUNDLE_INFERNO?: string;
  readonly VITE_STRIPE_LINK_BUNDLE_FROST?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
