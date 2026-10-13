import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { home } from "../convex/gmailPage";

// Only the signed-out screen is public. Personal data stays in authenticated HTTP routes.
let html = home(true, false);
const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const js = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!css || !js) throw new Error("Could not find the shared screen styles and interactions.");
const sessionCheck = `\nwindow.addEventListener('pageshow',()=>{if(new URLSearchParams(location.search).get('notice')==='salary'){document.getElementById('screen').hidden=true;const loading=document.getElementById('loading');loading.hidden=false;const recorded=document.createElement('p');recorded.textContent='Salary recorded';recorded.setAttribute('role','status');loading.prepend(recorded);}});\nfetch('/session', {credentials:'same-origin',cache:'no-store'}).then(response => {if(response.status===204) location.replace('/home'+location.search);}).catch(() => {});`;
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0,12);
const cssName = `finsightx-${hash(css)}.css`;
const script = js + sessionCheck;
const jsName = `finsightx-${hash(script)}.js`;
html = html.replace(/<style>[\s\S]*?<\/style>/, `<link rel="stylesheet" href="/${cssName}">`).replace(/<script>[\s\S]*?<\/script>/, `<script src="/${jsName}" defer></script>`);
rmSync('dist', {recursive:true, force:true});
mkdirSync('dist', {recursive:true});
writeFileSync(`dist/${cssName}`,css);
writeFileSync(`dist/${jsName}`,script);
writeFileSync('dist/index.html',html);
console.log('Built the public screen and shared assets in dist/. Personal ledger data is not included.');
