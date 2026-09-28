/*
 * The projector theme and type scale for the big screen, applied to <html>
 * before the first paint (so a projector never flashes the day theme) and
 * undone when the viewer leaves. Used by <ScreenDocument> in the layout.
 */

/** Root font size that scales the rem-based layout with the viewport (16:9 at 1920 px ≈ 19 px). */
export const SCREEN_FONT_SIZE = "max(13px, min(1vw, 1.78vh))";

/** The projector layout (and its type scale) starts at this width; below it the page stacks and scrolls. */
export const SCREEN_WIDE_QUERY = "(min-width: 1024px)";

/**
 * Inline script: Night-O unless ?theme=light, plus the projector type scale
 * on wide screens. The previous values are kept in data-screen-prev-* so the
 * page can put them back when the viewer navigates away.
 */
export const SCREEN_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,s=d.dataset;if(!("bigScreen" in s)){s.screenPrevTheme=s.theme||"";s.screenPrevFont=d.style.fontSize||"";}var light=new URLSearchParams(location.search).get("theme")==="light";s.theme=light?"light":"dark";s.bigScreen="";if(window.matchMedia(${JSON.stringify(SCREEN_WIDE_QUERY)}).matches)d.style.fontSize=${JSON.stringify(SCREEN_FONT_SIZE)};}catch(e){}})();`;
