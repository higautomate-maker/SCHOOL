import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { applyOperation, getOperations } from "../../../../../../server/operations/repository";
import { operationActionSchema } from "../../../../../../server/operations/validation";

export const dynamic="force-dynamic";
type Context={params:Promise<{schoolId:string}>};
export async function GET(request:Request,context:Context){const actor=await getChatGPTUser();if(!actor)return Response.json({error:"Authentication required"},{status:401});const {schoolId}=await context.params;const sessionId=new URL(request.url).searchParams.get("sessionId");try{return Response.json({operations:await getOperations(schoolId,sessionId)});}catch(error){return Response.json({error:error instanceof Error?error.message:"Operations could not be loaded"},{status:404});}}
export async function POST(request:Request,context:Context){const actor=await getChatGPTUser();if(!actor)return Response.json({error:"Authentication required"},{status:401});const parsed=operationActionSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:"Invalid operation details",issues:parsed.error.issues},{status:422});const {schoolId}=await context.params;try{return Response.json({operations:await applyOperation(schoolId,parsed.data,actor)});}catch(error){const message=error instanceof Error?error.message:"Operation failed";return Response.json({error:message},{status:message.includes("not found")?404:409});}}
