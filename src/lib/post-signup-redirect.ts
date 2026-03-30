"use client";

const POST_SIGNUP_REDIRECT_KEY = "sr_post_signup_redirect";

export function storePostSignupRedirect(target: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(POST_SIGNUP_REDIRECT_KEY, target);
}

export function clearPostSignupRedirect() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(POST_SIGNUP_REDIRECT_KEY);
}

export function getPostSignupRedirect() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(POST_SIGNUP_REDIRECT_KEY);
}
