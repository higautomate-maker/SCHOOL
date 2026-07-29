export type AssetReportPdfData={
  title:string;
  description:string;
  headers:string[];
  rows:Array<Array<string|number>>;
  totalLabel:string;
  totalValue:string;
};

function pdfText(value:string|number){return String(value).replaceAll("₹","INR ").replaceAll(/[^\x20-\x7E]/g,"-").replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)");}

export function buildAssetReportPdf(data:AssetReportPdfData){
  const pageRows=22,pages:Array<Array<Array<string|number>>>=[];
  for(let i=0;i<data.rows.length;i+=pageRows)pages.push(data.rows.slice(i,i+pageRows));
  if(!pages.length)pages.push([]);
  const encoder=new TextEncoder(),objects:string[]=[];
  objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
  const pageObjectNumbers=pages.map((_,index)=>4+index*2);
  objects[2]=`<< /Type /Pages /Kids [${pageObjectNumbers.map(x=>`${x} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((rows,pageIndex)=>{
    const pageObject=4+pageIndex*2,contentObject=pageObject+1,columnWidth=782/data.headers.length,maxChars=Math.max(7,Math.floor(columnWidth/4.25));
    let content="0.15 0.20 0.26 rg\nBT /F1 16 Tf 36 555 Td (Hig School - Asset Management) Tj ET\n";
    content+=`BT /F1 12 Tf 36 532 Td (${pdfText(data.title)}) Tj ET\nBT /F1 7 Tf 36 517 Td (${pdfText(data.description)}) Tj ET\n`;
    content+=`BT /F1 7 Tf 660 555 Td (Page ${pageIndex+1} of ${pages.length}) Tj ET\nBT /F1 7 Tf 660 542 Td (Generated ${pdfText(new Date().toLocaleDateString("en-IN"))}) Tj ET\n`;
    content+="0.91 0.94 0.96 rg 30 483 782 22 re f\n0.36 0.42 0.48 rg\n";
    data.headers.forEach((header,index)=>{content+=`BT /F1 6 Tf ${34+index*columnWidth} 491 Td (${pdfText(header).slice(0,maxChars)}) Tj ET\n`;});
    rows.forEach((row,rowIndex)=>{
      const y=468-rowIndex*19;
      if(rowIndex%2===1)content+=`0.975 0.98 0.985 rg 30 ${y-6} 782 19 re f\n0.25 0.31 0.37 rg\n`;
      row.forEach((cell,columnIndex)=>{content+=`BT /F1 6 Tf ${34+columnIndex*columnWidth} ${y} Td (${pdfText(cell).slice(0,maxChars)}) Tj ET\n`;});
      content+=`0.86 0.89 0.91 RG 30 ${y-7} m 812 ${y-7} l S\n0.25 0.31 0.37 rg\n`;
    });
    content+=`BT /F1 7 Tf 36 35 Td (${pdfText(data.totalLabel)}: ${pdfText(data.totalValue)}) Tj ET\nBT /F1 6 Tf 620 35 Td (HIG automation India private limited) Tj ET\n`;
    objects[pageObject]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject]=`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`;
  });
  let pdf="%PDF-1.4\n% HIG School report\n";const offsets=[0];
  for(let i=1;i<objects.length;i++){offsets[i]=encoder.encode(pdf).length;pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=encoder.encode(pdf).length;
  pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(pdf);
}
