import { mobileJson } from '../../../../../../server/mobile-auth/http.ts';
import { authenticatedMobilePrincipal } from '../../../../../../server/mobile-auth/service.ts';
import { mobileAppErrorResponse } from '../../../../../../server/mobile-app/http.ts';
import { getParentPaymentStatus } from '../../../../../../server/payments/service.ts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({error: 'Authentication required'},401);
    return mobileJson({payment: await getParentPaymentStatus(principal,
      new URL(request.url).searchParams.get('orderId') ?? '')});
  } catch (error) {return mobileAppErrorResponse(error,'Payment status unavailable');}
}
