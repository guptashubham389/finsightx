import { mkdirSync, writeFileSync } from "node:fs";
import { home, page } from "../convex/gmailPage";
import { dashboard, salaryScreen, transactionScreen } from "../convex/screens";
const rows = [
 {date:'2026-10-10',amount:1250,payee:'Fresh groceries',direction:'debit' as const,sourceKey:'example-alert'},
 {date:'2026-10-09',amount:680,payee:'Lunch with friends',direction:'debit' as const,sourceKey:'example-alert-2'},
 {date:'2026-10-20',amount:12000,payee:'Monthly rent',direction:'debit' as const,sourceKey:'manual:example-rent',kind:'upcoming' as const,note:'October rent'},
];
const screens = {
 'Connect Gmail':home(true,false),
 'Salary':salaryScreen('preview'),
 'Home':dashboard({amount:30000,date:'2026-10-01'},rows,new URLSearchParams(),'2026-10-11'),
 'Upcoming':dashboard({amount:30000,date:'2026-10-01'},rows,new URLSearchParams('filter=upcoming'),'2026-10-11'),
 'Low balance':dashboard({amount:18000,date:'2026-10-01'},rows,new URLSearchParams(),'2026-10-11'),
 'Add transaction':transactionScreen('preview'),
 'Form errors':transactionScreen('preview',{date:'Enter the date',payee:'Enter the payee',amount:'Enter the amount'},{date:''}),
 'Gmail error':page('<h1>We could not connect to your Gmail.</h1><a class="button" href="/gmail/start">Try again</a>'),
 'Loading':page('<h1>Our engine is reading your spend alerts.</h1>'),
};
const data = JSON.stringify(screens).replace(/</g,'\\u003c');
mkdirSync('test-results',{recursive:true});
writeFileSync('test-results/screens-preview.html',`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FinSightX screen preview</title><style>body{margin:0;font:14px/1.5 sans-serif;background:#f4f6fa;color:#30343b}nav{padding:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}select{padding:8px;font:inherit}iframe{display:block;width:100%;height:calc(100vh - 90px);border:0;background:white}</style></head><body><nav><strong>Screen preview</strong><select aria-label="Choose screen" id="select"></select><span>Example values · saving and Gmail connection are disabled here</span></nav><iframe title="FinSightX screen" id="frame"></iframe><script>const screens=${data};const select=document.getElementById('select');for(const name of Object.keys(screens)){const option=document.createElement('option');option.textContent=name;select.appendChild(option)}function show(){document.getElementById('frame').srcdoc=screens[select.value].replace('</body>','<script>document.querySelectorAll("form").forEach(f=>f.addEventListener("submit",e=>{e.preventDefault();alert("This is a preview. Saving works in the connected app after deployment.")}));document.querySelectorAll("a").forEach(a=>a.addEventListener("click",e=>e.preventDefault()));<\\/script></body>')}select.onchange=show;show();</script></body></html>`);
console.log('Preview saved to test-results/screens-preview.html');
