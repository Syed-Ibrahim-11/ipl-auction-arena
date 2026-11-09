"use client";

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("arena-theme");document.documentElement.dataset.theme=t==="classic"?"classic":"dark";}catch(e){}})();`;

export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}
