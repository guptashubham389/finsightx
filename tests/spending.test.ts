import { test } from "node:test";
import assert from "node:assert/strict";
import { spending, salaryCycle } from "../convex/spending";
const salary = {amount: 20000, date: '2026-10-01'};
test('salary minus spending and upcoming bills; Gmail duplicates count once', () => {
 const rows = [
 {date:'2026-10-10',amount:1000,payee:'Shop',direction:'debit' as const,sourceKey:'gmail'},
 {date:'2026-10-10',amount:1000,payee:'shop',direction:'debit' as const,sourceKey:'manual:1'},
 {date:'2026-10-20',amount:2000,payee:'Rent',direction:'debit' as const,sourceKey:'manual:2',kind:'upcoming' as const},
 {date:'2026-10-01',amount:20000,payee:'Salary',direction:'credit' as const,sourceKey:'salary'},
 ];
 const result = spending(salary, rows, '2026-10-11');
 assert.equal(result.available,17000);assert.equal(result.days,21);assert.equal(result.spent,1000);assert.equal(result.upcoming,2000);
});
test('salary day starts a new period; short months clamp the payday',()=>{
 assert.deepEqual(salaryCycle('2026-01-31','2026-02-28'),{start:'2026-02-28',end:'2026-03-31',days:31});
 assert.deepEqual(salaryCycle('2026-10-15','2026-10-11'),{start:'2026-09-15',end:'2026-10-15',days:4});
});
