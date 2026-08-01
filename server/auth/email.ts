import { connect } from "node:tls";

export type SecurityEmail={to:string;subject:string;text:string};
export interface EmailDelivery{send(message:SecurityEmail):Promise<void>}
const captureKey=Symbol.for("hig.auth.email-capture");type CaptureGlobal=typeof globalThis&{[captureKey]?:SecurityEmail[]};
export function capturedSecurityEmails():readonly SecurityEmail[]{return (globalThis as CaptureGlobal)[captureKey]??[];}
export function clearCapturedSecurityEmails(){(globalThis as CaptureGlobal)[captureKey]=[];}
export function emailDelivery(environment:Record<string,string|undefined>=process.env):EmailDelivery{
  const localCapture=!environment.HIG_EMAIL_ADAPTER&&environment.NODE_ENV!=="production"&&environment.HIG_DEPLOYMENT_ENV!=="staging";
  if(environment.HIG_EMAIL_ADAPTER==="capture"||localCapture){
    if(environment.NODE_ENV==="production"&&environment.HIG_DEPLOYMENT_ENV!=="staging"&&environment.HIG_DEPLOYMENT_ENV!=="sales-demo")throw new Error("Capture email adapter is forbidden in production");
    return{async send(message){const target=globalThis as CaptureGlobal;(target[captureKey]??=[]).push({...message});}};
  }
  const url=environment.SMTP_URL;if(!url)throw new Error("Secure email delivery is not configured");return smtpAdapter(new URL(url),environment.SMTP_FROM??"");
}
export async function deliverInvitation(email:string,rawToken:string,environment:Record<string,string|undefined>=process.env):Promise<void>{const base=environment.APP_URL;if(!base)throw new Error("APP_URL is required for invitation delivery");const link=new URL(`/invitation/accept?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}`,base);await emailDelivery(environment).send({to:email,subject:"Activate your HIG School account",text:`Open this link to activate your account: ${link}`});}
function smtpAdapter(url:URL,from:string):EmailDelivery{
  if(url.protocol!=="smtps:"||!from)throw new Error("SMTP requires smtps:// and SMTP_FROM");
  const envelopeFrom=mailbox(from),headerFrom=from.replace(/[\r\n]/g,"");
  return{send(message){const recipient=mailbox(message.to);return new Promise((resolve,reject)=>{const socket=connect({host:url.hostname,port:Number(url.port||465),servername:url.hostname});let buffer="",stage=0;const commands=[`EHLO hig-school`, `AUTH PLAIN ${Buffer.from(`\0${decodeURIComponent(url.username)}\0${decodeURIComponent(url.password)}`).toString("base64")}`,`MAIL FROM:<${envelopeFrom}>`,`RCPT TO:<${recipient}>`,`DATA`, `From: ${headerFrom}\r\nTo: ${recipient}\r\nSubject: ${message.subject.replace(/[\r\n]/g,"")}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${message.text.replace(/^\./gm,"..")}\r\n.`,`QUIT`];const fail=(e:unknown)=>{socket.destroy();reject(e instanceof Error?e:new Error("SMTP delivery failed"));};socket.setEncoding("utf8");socket.setTimeout(15_000,()=>fail(new Error("SMTP delivery timed out")));socket.on("error",fail);socket.on("data",chunk=>{buffer+=chunk;if(!buffer.includes("\n"))return;const lines=buffer.split(/\r?\n/);buffer=lines.pop()??"";for(const line of lines){if(!/^\d{3}[ -]/.test(line)||line[3]==="-")continue;const code=Number(line.slice(0,3));if(code>=400)return fail(new Error("SMTP delivery rejected"));if(stage<commands.length)socket.write(`${commands[stage++]}\r\n`);else{socket.end();resolve();}}});});}};
}
function mailbox(value:string):string{const match=value.match(/<([^<>]+)>$/);const address=(match?.[1]??value).trim();if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)||/[\r\n]/.test(value))throw new Error("Invalid SMTP mailbox");return address;}
