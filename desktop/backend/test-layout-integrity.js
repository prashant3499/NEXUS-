'use strict';

/**
 * test-layout-integrity.js
 *
 * Guards against the "pages overlapping" regression.
 *
 * Root cause (fixed): the .drawer-backdrop div is rendered in every Shell(),
 * but its CSS (display:none; position:fixed) lived ONLY inside the
 * @media(max-width:700px) block. On desktop/tablet the backdrop rendered as
 * a visible block-level element and, as the first child of the .shell CSS
 * grid, consumed a grid cell — shoving rail/canvas/footer out of place.
 *
 * These assertions lock in the fix:
 *   1. .drawer-backdrop has a BASE display:none (outside any media query)
 *   2. .shell defines explicit grid-template-areas
 *   3. rail, canvas, footer are each assigned to a named grid area
 *   4. the footer spans both columns (its own row)
 *   5. Shell() renders exactly the children the grid expects
 */

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');

// Extract just the <style> contents so media-query scoping can be reasoned about
const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
const css = styleMatch ? styleMatch[1] : html;

sec('Drawer backdrop — base hidden rule');
{
  // There must be a base rule `.drawer-backdrop{display:none}` that is NOT
  // inside a media query. We check by finding the rule and ensuring the
  // nearest preceding unbalanced `{` is not from an @media.
  const baseRule = /\.drawer-backdrop\s*\{\s*display:\s*none\s*\}/.test(css);
  a(baseRule, 'Base .drawer-backdrop{display:none} rule exists');

  // Locate it and verify it sits at top level (not nested in @media).
  const idx = css.indexOf('.drawer-backdrop{display:none}');
  a(idx > -1, 'Base rule is the compact form (top-level, not media-nested)');
  if (idx > -1) {
    // Count unclosed @media blocks before this point: scan for '@media' and '}'
    const before = css.slice(0, idx);
    const mediaOpens = (before.match(/@media[^{]*\{/g) || []).length;
    // Each top-level media block we entered must have closed. A rough balance
    // check: count '{' and '}' — but simplest: ensure the rule isn't indented
    // (media-nested rules in this file are indented with 2 spaces).
    const lineStart = css.lastIndexOf('\n', idx) + 1;
    const indent = css.slice(lineStart, idx);
    a(indent.trim() === '', 'Base rule is NOT indented (confirms top-level scope)');
  }
}

sec('Shell grid — explicit named areas');
{
  a(/\.shell\s*\{[^}]*display:\s*grid/.test(css), '.shell is display:grid');
  a(/\.shell\s*\{[^}]*grid-template-areas/.test(css), '.shell defines grid-template-areas');
  // The areas must include rail, canvas, and a full-width footer row
  const shellRule = css.match(/\.shell\s*\{([^}]*)\}/);
  const shellBody = shellRule ? shellRule[1] : '';
  a(/"rail canvas"/.test(shellBody), 'Top row: rail + canvas');
  a(/"footer footer"/.test(shellBody), 'Bottom row: footer spans both columns');
}

sec('Grid area assignments');
{
  a(/\.shell\s*>\s*\.rail\s*\{\s*grid-area:\s*rail/.test(css), 'rail → grid-area rail');
  a(/\.shell\s*>\s*\.canvas\s*\{\s*grid-area:\s*canvas/.test(css), 'canvas → grid-area canvas');
  a(/\.shell\s*>\s*footer\s*\{\s*grid-area:\s*footer/.test(css), 'footer → grid-area footer');
}

sec('Mobile drawer — fixed positioning only inside media query');
{
  // The position:fixed for .rail must be inside @media(max-width:700px),
  // NOT a base rule (otherwise the rail floats over content on desktop).
  const mediaBlock = css.match(/@media\(max-width:700px\)\{([\s\S]*?)\n\}/);
  const mb = mediaBlock ? mediaBlock[1] : '';
  a(/\.rail\{[^}]*position:fixed/.test(mb), 'rail position:fixed lives inside @700px media query');
  // And the base .rail rule must NOT be position:fixed
  const baseRail = css.match(/(?:^|\n)\.rail\{([^}]*)\}/);
  const br = baseRail ? baseRail[1] : '';
  a(!/position:fixed/.test(br), 'Base .rail is NOT position:fixed (stays in grid on desktop)');
}

sec('Mobile grid — single column with stacked areas');
{
  const mediaBlock = css.match(/@media\(max-width:700px\)\{([\s\S]*?)\n\}/);
  const mb = mediaBlock ? mediaBlock[1] : '';
  a(/\.shell\{[^}]*grid-template-columns:1fr/.test(mb), 'Mobile shell is single column');
  a(/grid-template-areas:"canvas" "footer"/.test(mb), 'Mobile stacks canvas over footer');
}

sec('Shell() renders the expected grid children');
{
  // The Shell template literal must contain exactly: drawer-backdrop, rail,
  // canvas, footer — in that order, as direct children of .shell.
  const shellFn = html.match(/return `<div class="shell">([\s\S]*?)`;\s*\n\}/);
  const shellTpl = shellFn ? shellFn[1] : '';
  a(shellTpl.includes('class="drawer-backdrop"'), 'Renders drawer-backdrop');
  a(shellTpl.includes('class="rail'), 'Renders rail');
  a(shellTpl.includes('class="canvas"'), 'Renders canvas');
  a(/footerHTML\(\)/.test(shellTpl), 'Renders footer via footerHTML()');
  // Order check: backdrop before rail before canvas
  const iBackdrop = shellTpl.indexOf('drawer-backdrop');
  const iRail = shellTpl.indexOf('class="rail');
  const iCanvas = shellTpl.indexOf('class="canvas"');
  a(iBackdrop < iRail && iRail < iCanvas, 'Children in order: backdrop, rail, canvas');
}

sec('wire() — shared utility cluster wired for ALL roles');
{
  // Regression guard: the top-bar utility cluster (Home/Settings/Profile/Cart)
  // and profile menu used to be wired AFTER the buyer/seller early-returns in
  // wire(), so they were dead for non-founder roles. They must now run via
  // wireShared() called at the top of wire(), before any role-specific return.
  const js = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/)[1];
  a(/function wireShared\s*\(\)/.test(js), 'wireShared() function exists');
  // wire() must call wireShared() before the buyer/seller returns
  const wireBody = js.match(/function wire\(\)\{([\s\S]*?)\n\}/);
  const wb = wireBody ? wireBody[1] : '';
  a(/wireShared\(\)/.test(wb), 'wire() calls wireShared()');
  const iShared = wb.indexOf('wireShared()');
  const iBuyerReturn = wb.indexOf("if(ROLE==='buyer')");
  a(iShared > -1 && (iBuyerReturn === -1 || iShared < iBuyerReturn), 'wireShared() called before buyer early-return');
  // The util/profile wiring must live inside wireShared, not wire
  const sharedBody = js.match(/function wireShared\(\)\{([\s\S]*?)\n\}/);
  const sb = sharedBody ? sharedBody[1] : '';
  a(/\[data-util\]/.test(sb), 'wireShared wires [data-util] buttons');
  a(/\[data-um\]/.test(sb), 'wireShared wires [data-um] profile menu');
}

sec('Language picker — only translated locales are selectable');
{
  const js = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/)[1];
  // Active LOCALES must all have a translation table in I18N_TABLES
  const localesM = js.match(/const LOCALES\s*=\s*\[([\s\S]*?)\];/);
  const localeCodes = localesM ? [...localesM[1].matchAll(/code:\s*'(\w+)'/g)].map(m => m[1]) : [];
  const tablesM = js.match(/const I18N_TABLES\s*=\s*\{([^}]*)\}/);
  const tableKeys = tablesM ? [...tablesM[1].matchAll(/(\w+)\s*:/g)].map(m => m[1]) : [];
  a(localeCodes.length > 0, 'At least one active locale');
  a(localeCodes.every(c => tableKeys.includes(c)), `Every active locale has a translation table (${localeCodes.join(',')} ⊆ ${tableKeys.join(',')})`);
  // Coming-soon locales are declared separately and not in the active set
  a(/LOCALES_COMING_SOON/.test(js), 'Coming-soon locales declared separately');
}

sec('Service worker — HTML shell is network-first (not stale-while-revalidate)');
{
  const sw = fs.readFileSync(path.join(__dirname, 'public/sw.js'), 'utf8');
  // The HTML routing branch must call networkFirst, not staleWhileRevalidate
  const htmlBranch = sw.match(/pathname === '\/' \|\| url\.pathname\.endsWith\('\.html'\)\)\s*\{([\s\S]*?)\}/);
  const hb = htmlBranch ? htmlBranch[1] : '';
  a(/networkFirst/.test(hb), 'HTML shell served network-first');
  a(!/staleWhileRevalidate/.test(hb), 'HTML shell NOT stale-while-revalidate');
}

sec('Service worker — auto-reload on update (fixes reach users without manual refresh)');
{
  const js = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/)[1];
  a(/controllerchange/.test(js), 'Listens for controllerchange');
  a(/location\.reload\(\)/.test(js), 'Reloads when a new SW takes control');
  a(/postMessage\('SKIP_WAITING'\)/.test(js), 'Tells the waiting SW to activate immediately');
  a(/reg\.update\(\)/.test(js), 'Proactively checks for an updated SW on load');
}

sec('render() — guarded against missing DOM nodes');
{
  const js = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/)[1];
  const renderBody = js.match(/function render\(\)\{([\s\S]*?)\n\}/);
  const rb = renderBody ? renderBody[1] : '';
  // Must not access .style/.classList directly on an unchecked $() result
  a(!/\$\('aiFab'\)\.style/.test(rb), 'aiFab access is guarded (no direct .style on $())');
  a(/const fab = \$\('aiFab'\); if \(fab\)/.test(rb) || /if\s*\(\s*fab\s*\)/.test(rb), 'aiFab null-checked');
  a(/try\s*\{\s*wire\(\)/.test(rb), 'wire() called inside try/catch so a wiring error cannot blank the page');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
