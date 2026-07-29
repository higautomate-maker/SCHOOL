import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetReportPdf } from "../app/school/asset-report-pdf.ts";

test("builds a paginated PDF asset report",()=>{
  const rows=Array.from({length:32},(_,index)=>[
    `HIG-IT-${String(index+1).padStart(3,"0")}`,
    `Asset ${index+1}`,
    "IT Equipment",
    index%2?"In Use":"In Store",
  ]);
  const bytes=buildAssetReportPdf({
    title:"Asset Register",
    description:"Fixed asset register",
    headers:["Tag","Name","Category","Status"],
    rows,
    totalLabel:"Assets",
    totalValue:"32",
  });
  const pdf=new TextDecoder().decode(bytes);
  assert.equal(pdf.slice(0,8),"%PDF-1.4");
  assert.match(pdf,/\/Count 2\b/);
  assert.match(pdf,/Asset Register/);
  assert.match(pdf,/HIG automation India private limited/);
  assert.match(pdf,/xref[\s\S]*startxref[\s\S]*%%EOF$/);
});
